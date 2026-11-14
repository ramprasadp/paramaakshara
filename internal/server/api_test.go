// SPDX-License-Identifier: GPL-3.0-or-later

package server

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/ramprasadp/paramaakshara/internal/config"
	"github.com/ramprasadp/paramaakshara/internal/document"
	"github.com/ramprasadp/paramaakshara/internal/folder"
	"github.com/ramprasadp/paramaakshara/internal/pdf"
)

type apiFixture struct {
	h      http.Handler
	cookie string
	docs   string
}

func newAPIFixture(t *testing.T) *apiFixture {
	t.Helper()
	return newAPIFixtureWith(t, func(*Options) {})
}

// newAPIFixtureWith lets set change the options, for example to add a
// fake PDF maker or folder picker.
func newAPIFixtureWith(t *testing.T, set func(*Options)) *apiFixture {
	t.Helper()
	log.SetOutput(io.Discard)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })
	base := t.TempDir()
	docs := filepath.Join(base, "docs")
	store, err := document.NewStore([]config.Root{{Name: "Documents", Path: docs}}, 1<<16, 2, filepath.Join(base, "backups"))
	if err != nil {
		t.Fatal(err)
	}
	auth := NewAuth(nil)
	opts := Options{
		Assets:   fstest.MapFS{},
		Version:  "test",
		Port:     testPort,
		Auth:     auth,
		Store:    store,
		Recovery: document.NewRecovery(filepath.Join(base, "recovery"), 1<<16),
		Client:   ClientConfig{Roots: []string{"Documents"}, MaxDocumentBytes: 1 << 16, RecoveryIntervalSeconds: 15},
	}
	set(&opts)
	h := New(opts)
	session, _ := auth.Redeem(auth.Token())
	return &apiFixture{h: h, cookie: session, docs: docs}
}

func (f *apiFixture) call(t *testing.T, method, target string, body any) (int, map[string]any) {
	t.Helper()
	var r io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		r = strings.NewReader(string(data))
	}
	req := httptest.NewRequest(method, target, r)
	req.Host = testHost
	req.Header.Set("Origin", testOrigin)
	req.AddCookie(&http.Cookie{Name: CookieName, Value: f.cookie})
	rec := httptest.NewRecorder()
	f.h.ServeHTTP(rec, req)
	var out map[string]any
	if rec.Body.Len() > 0 {
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatalf("%s %s: body %q is not JSON", method, target, rec.Body.String())
		}
	}
	return rec.Code, out
}

func errCode(out map[string]any) string {
	e, _ := out["error"].(map[string]any)
	s, _ := e["code"].(string)
	return s
}

func TestConfigHidesFolderPaths(t *testing.T) {
	f := newAPIFixture(t)
	status, out := f.call(t, "GET", "/api/config", nil)
	if status != 200 {
		t.Fatalf("status %d", status)
	}
	data, _ := json.Marshal(out)
	if strings.Contains(string(data), f.docs) {
		t.Fatalf("config exposes the folder path: %s", data)
	}
	if roots := out["roots"].([]any); len(roots) != 1 || roots[0] != "Documents" {
		t.Fatalf("roots = %v", roots)
	}
}

func TestSaveOpenListThroughAPI(t *testing.T) {
	f := newAPIFixture(t)
	content := "स॒हस्र॑शीर्षा॒\nपुरु॑षः\n"
	status, out := f.call(t, "PUT", "/api/document", map[string]any{
		"root": "Documents", "path": "rv/purusha.txt", "base_revision": "", "content": content,
	})
	if status != 200 || !strings.HasPrefix(out["revision"].(string), "sha256:") {
		t.Fatalf("save: %d %v", status, out)
	}
	rev := out["revision"].(string)

	status, out = f.call(t, "GET", "/api/document?root=Documents&path=rv/purusha.txt", nil)
	if status != 200 || out["content"] != content || out["revision"] != rev || out["line_ending"] != "lf" {
		t.Fatalf("open: %d %v", status, out)
	}

	status, out = f.call(t, "GET", "/api/documents?root=Documents", nil)
	entries := out["entries"].([]any)
	if status != 200 || len(entries) != 1 || entries[0].(map[string]any)["path"] != "rv/purusha.txt" {
		t.Fatalf("list: %d %v", status, out)
	}
}

func TestSaveConflictReturnsCurrentRevision(t *testing.T) {
	f := newAPIFixture(t)
	_, out := f.call(t, "PUT", "/api/document", map[string]any{"root": "Documents", "path": "c.txt", "content": "one"})
	rev := out["revision"].(string)
	os.WriteFile(filepath.Join(f.docs, "c.txt"), []byte("edited elsewhere"), 0o644)
	status, out := f.call(t, "PUT", "/api/document", map[string]any{
		"root": "Documents", "path": "c.txt", "base_revision": rev, "content": "two",
	})
	e := out["error"].(map[string]any)
	if status != 409 || e["code"] != "conflict" || e["current_revision"] != document.Revision([]byte("edited elsewhere")) {
		t.Fatalf("conflict: %d %v", status, out)
	}
}

func TestDocumentErrors(t *testing.T) {
	f := newAPIFixture(t)
	os.MkdirAll(f.docs, 0o755)
	os.WriteFile(filepath.Join(f.docs, "bad.txt"), []byte("\xff"), 0o644)
	cases := []struct {
		method, target string
		body           any
		status         int
		code           string
	}{
		{"GET", "/api/document?root=Documents&path=bad.txt", nil, 422, "invalid_utf8"},
		{"GET", "/api/document?root=Documents&path=missing.txt", nil, 404, "not_found"},
		{"GET", "/api/document?root=Documents&path=../x.txt", nil, 400, "bad_request"},
		{"GET", "/api/document?root=Nope&path=x.txt", nil, 404, "not_found"},
		{"GET", "/api/documents?root=Nope", nil, 404, "not_found"},
		{"PUT", "/api/document", map[string]any{"root": "Documents", "path": "x.sh", "content": "x"}, 400, "bad_request"},
		{"PUT", "/api/document", map[string]any{"root": "Documents", "path": "x.txt", "content": strings.Repeat("a", 1<<16+1)}, 413, "too_large"},
		{"PUT", "/api/document", map[string]any{"root": "Documents", "path": "x.txt", "content": "a", "line_ending": "cr"}, 400, "bad_request"},
		{"PUT", "/api/document", "not an object", 400, "bad_request"},
	}
	for _, c := range cases {
		status, out := f.call(t, c.method, c.target, c.body)
		if status != c.status || errCode(out) != c.code {
			t.Errorf("%s %s: %d %v; want %d %s", c.method, c.target, status, out, c.status, c.code)
		}
	}
}

func TestRecoveryAPI(t *testing.T) {
	f := newAPIFixture(t)
	project := map[string]any{"format": "paramaakshara", "segments": []any{}}
	status, _ := f.call(t, "PUT", "/api/recovery/tab-1", map[string]any{"name": "Untitled", "project": project})
	if status != 204 {
		t.Fatalf("put: %d", status)
	}
	_, out := f.call(t, "GET", "/api/recovery", nil)
	list := out["snapshots"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["key"] != "tab-1" || list[0].(map[string]any)["project"] != nil {
		t.Fatalf("list: %v", out)
	}
	status, out = f.call(t, "GET", "/api/recovery/tab-1", nil)
	if status != 200 || out["project"].(map[string]any)["format"] != "paramaakshara" {
		t.Fatalf("get: %d %v", status, out)
	}
	if status, _ := f.call(t, "DELETE", "/api/recovery/tab-1", nil); status != 204 {
		t.Fatalf("delete: %d", status)
	}
	if status, out := f.call(t, "PUT", "/api/recovery/bad.key", map[string]any{"project": project}); status != 400 || errCode(out) != "bad_request" {
		t.Fatalf("bad key: %d %v", status, out)
	}
}

func TestDocumentAPIRequiresSessionAndOrigin(t *testing.T) {
	f := newAPIFixture(t)
	req := httptest.NewRequest("PUT", "/api/document", strings.NewReader(`{"root":"Documents","path":"x.txt","content":"x"}`))
	req.Host = testHost
	req.Header.Set("Origin", "https://evil.example")
	req.AddCookie(&http.Cookie{Name: CookieName, Value: f.cookie})
	rec := httptest.NewRecorder()
	f.h.ServeHTTP(rec, req)
	if rec.Code != 403 {
		t.Fatalf("foreign origin: %d", rec.Code)
	}
	req = httptest.NewRequest("GET", "/api/document?root=Documents&path=x.txt", nil)
	req.Host = testHost
	rec = httptest.NewRecorder()
	f.h.ServeHTTP(rec, req)
	if rec.Code != 401 {
		t.Fatalf("no session: %d", rec.Code)
	}
	if _, err := os.Stat(filepath.Join(f.docs, "x.txt")); !os.IsNotExist(err) {
		t.Fatal("a refused request wrote a file")
	}
}

// fakePDF records the request and returns a fixed PDF.
type fakePDF struct {
	got pdf.Request
	err error
}

func (f *fakePDF) Make(_ context.Context, r pdf.Request) ([]byte, error) {
	f.got = r
	return []byte("%PDF-1.7 fake"), f.err
}

func TestExportPDF(t *testing.T) {
	maker := &fakePDF{}
	f := newAPIFixtureWith(t, func(o *Options) { o.PDF = maker })
	req := map[string]any{
		"root": "Documents", "path": "rv/sukta.pdf", "base_revision": "",
		"page": "A4", "size_pt": 18, "lines": []string{"स भूमिं॑", ""},
	}
	status, body := f.call(t, "POST", "/api/export/pdf", req)
	if status != http.StatusOK || body["revision"] == "" {
		t.Fatalf("status %d body %v", status, body)
	}
	if maker.got.Name != "sukta" || maker.got.Page != "A4" || len(maker.got.Lines) != 2 {
		t.Errorf("maker got %+v", maker.got)
	}
	data, err := os.ReadFile(filepath.Join(f.docs, "rv", "sukta.pdf"))
	if err != nil || string(data) != "%PDF-1.7 fake" {
		t.Fatalf("written %q, %v", data, err)
	}
	// An existing PDF is not replaced without its revision.
	maker.got = pdf.Request{}
	status, body = f.call(t, "POST", "/api/export/pdf", req)
	if status != http.StatusConflict || code(body) != "conflict" {
		t.Fatalf("second export: status %d body %v", status, body)
	}
	if maker.got.Page != "" {
		t.Error("the PDF was made although the file exists")
	}

	req["page"] = "A3"
	if status, _ := f.call(t, "POST", "/api/export/pdf", req); status != http.StatusBadRequest {
		t.Errorf("page A3: status %d", status)
	}
	req["page"], req["path"] = "A4", "sukta.txt"
	if status, _ := f.call(t, "POST", "/api/export/pdf", req); status != http.StatusBadRequest {
		t.Errorf("a .txt path: status %d", status)
	}

	maker.err = pdf.ErrUnavailable
	req["path"] = "other.pdf"
	status, body = f.call(t, "POST", "/api/export/pdf", req)
	if status != http.StatusServiceUnavailable || code(body) != "unavailable" {
		t.Fatalf("no browser: status %d body %v", status, body)
	}
}

func TestExportPDFWithoutMaker(t *testing.T) {
	f := newAPIFixture(t)
	status, body := f.call(t, "POST", "/api/export/pdf", map[string]any{
		"root": "Documents", "path": "a.pdf", "page": "A4", "size_pt": 18,
	})
	if status != http.StatusServiceUnavailable || code(body) != "unavailable" {
		t.Fatalf("status %d body %v", status, body)
	}
}

func code(out map[string]any) any {
	e, _ := out["error"].(map[string]any)
	return e["code"]
}

func TestPickFolder(t *testing.T) {
	picked := t.TempDir()
	var start string
	result, err := picked, error(nil)
	f := newAPIFixtureWith(t, func(o *Options) {
		o.PickFolder = func(_ context.Context, s string) (string, error) {
			start = s
			return result, err
		}
	})
	status, body := f.call(t, "POST", "/api/folders/pick", map[string]any{"start": "Documents"})
	root, _ := body["root"].(string)
	if status != http.StatusOK || !strings.HasPrefix(root, document.PickedPrefix) || body["name"] != filepath.Base(picked) {
		t.Fatalf("status %d body %v", status, body)
	}
	if start != f.docs {
		t.Errorf("picker started in %q, want the Documents folder", start)
	}
	// The picked folder can be written like a configured one.
	status, _ = f.call(t, "PUT", "/api/document", map[string]any{"root": root, "path": "a.txt", "content": "एक"})
	if got, _ := os.ReadFile(filepath.Join(picked, "a.txt")); status != http.StatusOK || string(got) != "एक" {
		t.Fatalf("save in picked folder: %d %q", status, got)
	}
	// A path from the browser is never a starting point.
	f.call(t, "POST", "/api/folders/pick", map[string]any{"start": "/etc"})
	if start != "" {
		t.Errorf("picker started in %q", start)
	}

	result, err = "", folder.ErrCancelled
	if status, _ := f.call(t, "POST", "/api/folders/pick", map[string]any{}); status != http.StatusNoContent {
		t.Errorf("cancelled: status %d", status)
	}
	err = folder.ErrUnavailable
	if status, body := f.call(t, "POST", "/api/folders/pick", map[string]any{}); status != http.StatusServiceUnavailable || code(body) != "unavailable" {
		t.Errorf("unavailable: %d %v", status, body)
	}
}

func TestPickFolderWithoutPicker(t *testing.T) {
	f := newAPIFixture(t)
	if status, body := f.call(t, "POST", "/api/folders/pick", map[string]any{}); status != http.StatusServiceUnavailable || code(body) != "unavailable" {
		t.Errorf("%d %v", status, body)
	}
}
