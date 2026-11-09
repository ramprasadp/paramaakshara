// SPDX-License-Identifier: GPL-3.0-or-later

package server

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"testing/fstest"
)

func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	log.SetOutput(io.Discard)
	t.Cleanup(func() { log.SetOutput(os.Stderr) })
	assets := fstest.MapFS{
		"index.html": {Data: []byte("<!doctype html><title>Paramaakshara</title>")},
	}
	srv := httptest.NewServer(New(assets, "test"))
	t.Cleanup(srv.Close)
	return srv
}

func TestHealth(t *testing.T) {
	srv := newTestServer(t)
	resp, err := http.Get(srv.URL + "/api/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["app"] != "paramaakshara" || body["version"] != "test" {
		t.Fatalf("body = %v", body)
	}
}

func TestServesIndex(t *testing.T) {
	srv := newTestServer(t)
	resp, err := http.Get(srv.URL + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
}
