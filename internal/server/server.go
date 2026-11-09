// SPDX-License-Identifier: GPL-3.0-or-later

// Package server implements the HTTP daemon that serves the editor.
package server

import (
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"time"
)

// New returns the daemon's HTTP handler. assets is the built frontend.
func New(assets fs.FS, version string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"app":     "paramaakshara",
			"version": version,
		})
	})
	mux.Handle("GET /", http.FileServerFS(assets))
	return logRequests(mux)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("write response: %v", err)
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

// logRequests logs method, path, status and duration. The query string is
// never logged because /auth carries the session token in it (spec §9.8).
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		log.Printf("%s %s %d %s", r.Method, r.URL.Path, rec.status, time.Since(start).Round(time.Microsecond))
	})
}
