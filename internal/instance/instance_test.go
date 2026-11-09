// SPDX-License-Identifier: GPL-3.0-or-later

package instance

import (
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

func TestSessionFileRoundTripAndMode(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "session.json")
	want := Session{Port: 9333, PID: 42, Token: "abc"}
	if err := WriteSession(path, want); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if mode := info.Mode().Perm(); mode != 0o600 {
		t.Fatalf("mode = %o, want 600", mode)
	}
	got, err := ReadSession(path)
	if err != nil || got != want {
		t.Fatalf("got %+v, %v; want %+v", got, err, want)
	}
	// Rewriting replaces the token and leaves no temporary files.
	want.Token = "def"
	if err := WriteSession(path, want); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(filepath.Dir(path))
	if len(entries) != 1 {
		t.Fatalf("directory has %d entries, want 1", len(entries))
	}
	if got, _ := ReadSession(path); got.Token != "def" {
		t.Fatalf("token = %q, want def", got.Token)
	}
}

func TestAuthURL(t *testing.T) {
	s := Session{Port: 9333, Token: "abc"}
	if got := s.AuthURL(); got != "http://127.0.0.1:9333/auth?token=abc" {
		t.Fatal(got)
	}
}

func serve(t *testing.T, body string) int {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/health" {
			w.Write([]byte(body))
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(srv.Close)
	_, p, _ := net.SplitHostPort(srv.Listener.Addr().String())
	port, _ := strconv.Atoi(p)
	return port
}

func TestIsParamaakshara(t *testing.T) {
	if !IsParamaakshara(serve(t, `{"app":"paramaakshara","version":"x"}`)) {
		t.Error("did not recognise a Paramaakshara daemon")
	}
	if IsParamaakshara(serve(t, `{"app":"other"}`)) {
		t.Error("recognised another program as Paramaakshara")
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close()
	if IsParamaakshara(port) {
		t.Error("recognised a closed port as Paramaakshara")
	}
}
