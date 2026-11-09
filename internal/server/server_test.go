// SPDX-License-Identifier: GPL-3.0-or-later

package server

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"
)

const (
	testPort   = 7531
	testHost   = "127.0.0.1:7531"
	testOrigin = "http://127.0.0.1:7531"
)

type fixture struct {
	h        http.Handler
	auth     *Auth
	tokens   []string // tokens passed to onToken
	shutdown int
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	log.SetOutput(io.Discard)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })
	f := &fixture{}
	f.auth = NewAuth(func(tok string) { f.tokens = append(f.tokens, tok) })
	f.h = New(Options{
		Assets:   fstest.MapFS{"index.html": {Data: []byte("<!doctype html><title>Paramaakshara</title>")}},
		Version:  "test",
		Port:     testPort,
		Auth:     f.auth,
		Shutdown: func() { f.shutdown++ },
	})
	return f
}

// do sends a request with the given Host; origin and cookie are optional.
func (f *fixture) do(method, target, host, origin, cookie string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	req.Host = host
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: CookieName, Value: cookie})
	}
	rec := httptest.NewRecorder()
	f.h.ServeHTTP(rec, req)
	return rec
}

// signIn redeems the current launch token and returns the session cookie.
func (f *fixture) signIn(t *testing.T) string {
	t.Helper()
	rec := f.do("GET", "/auth?token="+f.auth.Token(), testHost, "", "")
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("/auth status = %d, want 303", rec.Code)
	}
	for _, c := range rec.Result().Cookies() {
		if c.Name == CookieName {
			return c.Value
		}
	}
	t.Fatal("/auth set no session cookie")
	return ""
}

func errorCode(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Error struct{ Code string } `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body %q is not a structured error: %v", rec.Body.String(), err)
	}
	return body.Error.Code
}

func TestHealthIsPublic(t *testing.T) {
	f := newFixture(t)
	rec := f.do("GET", "/api/health", testHost, "", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["app"] != "paramaakshara" || body["version"] != "test" {
		t.Fatalf("body = %v", body)
	}
}

func TestServesIndex(t *testing.T) {
	f := newFixture(t)
	if rec := f.do("GET", "/", testHost, "", ""); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}

func TestHostCheck(t *testing.T) {
	f := newFixture(t)
	for _, host := range []string{testHost, "localhost:7531", "LOCALHOST:7531"} {
		if rec := f.do("GET", "/api/health", host, "", ""); rec.Code != http.StatusOK {
			t.Errorf("Host %q: status = %d, want 200", host, rec.Code)
		}
	}
	// DNS rebinding: an attacker's name resolving to 127.0.0.1.
	for _, host := range []string{"evil.example:7531", "127.0.0.1:9999", "127.0.0.1", "", "[::1]:7531"} {
		rec := f.do("GET", "/api/health", host, "", "")
		if rec.Code != http.StatusForbidden || errorCode(t, rec) != "forbidden" {
			t.Errorf("Host %q: status = %d, want 403 forbidden", host, rec.Code)
		}
	}
}

func TestAuthSetsStrictCookieAndRedirects(t *testing.T) {
	f := newFixture(t)
	rec := f.do("GET", "/auth?token="+f.auth.Token(), testHost, "", "")
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/" {
		t.Fatalf("status = %d, Location = %q; want 303 to /", rec.Code, rec.Header().Get("Location"))
	}
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("got %d cookies, want 1", len(cookies))
	}
	c := cookies[0]
	if c.Name != CookieName || !c.HttpOnly || c.SameSite != http.SameSiteStrictMode || c.Path != "/" {
		t.Fatalf("cookie = %+v; want %s, HttpOnly, SameSite=Strict, Path=/", c, CookieName)
	}
	if !f.auth.Valid(c.Value) {
		t.Fatal("cookie value is not a valid session")
	}
}

func TestAuthTokenIsSingleUseAndRotated(t *testing.T) {
	f := newFixture(t)
	first := f.auth.Token()
	f.signIn(t)
	if f.auth.Token() == first {
		t.Fatal("launch token was not replaced after use")
	}
	if len(f.tokens) != 2 || f.tokens[1] != f.auth.Token() {
		t.Fatalf("onToken calls = %d, want 2 with the current token last", len(f.tokens))
	}
	rec := f.do("GET", "/auth?token="+first, testHost, "", "")
	if rec.Code != http.StatusForbidden || len(rec.Result().Cookies()) != 0 {
		t.Fatalf("reused token: status = %d, want 403 and no cookie", rec.Code)
	}
}

func TestAuthRejectsWrongToken(t *testing.T) {
	f := newFixture(t)
	for _, target := range []string{"/auth", "/auth?token=", "/auth?token=0000"} {
		if rec := f.do("GET", target, testHost, "", ""); rec.Code != http.StatusForbidden {
			t.Errorf("%s: status = %d, want 403", target, rec.Code)
		}
	}
}

func TestAuthWithOldLinkWhenSignedIn(t *testing.T) {
	f := newFixture(t)
	cookie := f.signIn(t)
	rec := f.do("GET", "/auth?token=stale", testHost, "", cookie)
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("status = %d, want 303 for a signed-in browser", rec.Code)
	}
}

func TestAPIRequiresSession(t *testing.T) {
	f := newFixture(t)
	for _, c := range []struct{ method, path string }{
		{"POST", "/api/shutdown"},
		{"GET", "/api/config"},
		{"GET", "/api/anything"},
	} {
		for _, cookie := range []string{"", "not-a-session"} {
			rec := f.do(c.method, c.path, testHost, testOrigin, cookie)
			if rec.Code != http.StatusUnauthorized || errorCode(t, rec) != "unauthorized" {
				t.Errorf("%s %s cookie=%q: status = %d, want 401 unauthorized", c.method, c.path, cookie, rec.Code)
			}
		}
	}
	if f.shutdown != 0 {
		t.Fatal("shutdown ran without a session")
	}
}

func TestOriginCheckOnStateChangingRequests(t *testing.T) {
	f := newFixture(t)
	cookie := f.signIn(t)
	for _, origin := range []string{"", "https://evil.example", "http://127.0.0.1:9999", "null"} {
		rec := f.do("POST", "/api/shutdown", testHost, origin, cookie)
		if rec.Code != http.StatusForbidden || errorCode(t, rec) != "forbidden" {
			t.Errorf("Origin %q: status = %d, want 403 forbidden", origin, rec.Code)
		}
	}
	if f.shutdown != 0 {
		t.Fatal("shutdown ran despite a bad Origin")
	}
	for _, origin := range []string{testOrigin, "http://localhost:7531"} {
		if rec := f.do("POST", "/api/shutdown", testHost, origin, cookie); rec.Code != http.StatusOK {
			t.Errorf("Origin %q: status = %d, want 200", origin, rec.Code)
		}
	}
	if f.shutdown != 2 {
		t.Fatalf("shutdown calls = %d, want 2", f.shutdown)
	}
}

func TestUnknownAPIPathAfterSignIn(t *testing.T) {
	f := newFixture(t)
	cookie := f.signIn(t)
	rec := f.do("GET", "/api/nope", testHost, "", cookie)
	if rec.Code != http.StatusNotFound || errorCode(t, rec) != "not_found" {
		t.Fatalf("status = %d, want 404 not_found", rec.Code)
	}
}

func TestSecurityHeadersAndNoCORS(t *testing.T) {
	f := newFixture(t)
	cookie := f.signIn(t)
	responses := map[string]*httptest.ResponseRecorder{
		"index":     f.do("GET", "/", testHost, "", ""),
		"health":    f.do("GET", "/api/health", testHost, "https://evil.example", ""),
		"forbidden": f.do("GET", "/", "evil.example:7531", "", ""),
		"shutdown":  f.do("POST", "/api/shutdown", testHost, testOrigin, cookie),
	}
	for name, rec := range responses {
		csp := rec.Header().Get("Content-Security-Policy")
		if !strings.Contains(csp, "default-src 'self'") || strings.Contains(csp, "script-src") {
			t.Errorf("%s: CSP = %q", name, csp)
		}
		for key := range rec.Header() {
			if strings.HasPrefix(strings.ToLower(key), "access-control-") {
				t.Errorf("%s: unexpected CORS header %s", name, key)
			}
		}
	}
}

func TestLogOmitsQueryString(t *testing.T) {
	f := newFixture(t)
	var buf bytes.Buffer
	log.SetOutput(&buf)
	token := f.auth.Token()
	f.do("GET", "/auth?token="+token, testHost, "", "")
	if strings.Contains(buf.String(), token) {
		t.Fatalf("log contains the launch token: %q", buf.String())
	}
	if !strings.Contains(buf.String(), "GET /auth 303") {
		t.Fatalf("log line missing: %q", buf.String())
	}
}
