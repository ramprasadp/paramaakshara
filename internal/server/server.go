// SPDX-License-Identifier: GPL-3.0-or-later

// Package server implements the HTTP daemon that serves the editor.
package server

import (
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Options configures the handler returned by New.
type Options struct {
	Assets  fs.FS // built frontend
	Version string
	Port    int // used for the Host and Origin checks
	Auth    *Auth
	// Shutdown is called by POST /api/shutdown. It must not block.
	Shutdown func()
}

// New returns the daemon's HTTP handler.
func New(opts Options) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"app":     "paramaakshara",
			"version": opts.Version,
		})
	})
	mux.HandleFunc("GET /auth", authHandler(opts.Auth))
	mux.Handle("POST /api/shutdown", requireSession(opts.Auth, http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, map[string]string{"status": "shutting down"})
			if opts.Shutdown != nil {
				opts.Shutdown()
			}
		})))
	// Any other /api path: unknown endpoint, but only after the session
	// check, so unauthenticated callers learn nothing about the API.
	mux.Handle("/api/", requireSession(opts.Auth, http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			writeError(w, http.StatusNotFound, "not_found", "Unknown endpoint.")
		})))
	files := http.FileServerFS(opts.Assets)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			writeError(w, http.StatusMethodNotAllowed, "bad_request", "Method not allowed.")
			return
		}
		files.ServeHTTP(w, r)
	})

	origin := "http://127.0.0.1:" + strconv.Itoa(opts.Port)
	var h http.Handler = mux
	h = checkOrigin(origin, h)
	h = checkHost(opts.Port, h)
	h = securityHeaders(h)
	return logRequests(h)
}

// authHandler exchanges the launch token for a session cookie (§9.5).
func authHandler(auth *Auth) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		session, ok := auth.Redeem(r.URL.Query().Get("token"))
		if !ok {
			if c, err := r.Cookie(CookieName); err == nil && auth.Valid(c.Value) {
				// An old link, but this browser is already signed in.
				http.Redirect(w, r, "/", http.StatusSeeOther)
				return
			}
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte("This link has expired. Start Paramaakshara again to open the editor.\n"))
			return
		}
		http.SetCookie(w, &http.Cookie{
			Name:     CookieName,
			Value:    session,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteStrictMode,
		})
		http.Redirect(w, r, "/", http.StatusSeeOther)
	}
}

func requireSession(auth *Auth, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(CookieName)
		if err != nil || !auth.Valid(c.Value) {
			writeError(w, http.StatusUnauthorized, "unauthorized",
				"Not signed in. Start Paramaakshara to open the editor.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// checkHost rejects requests whose Host is not this daemon. This blocks
// DNS rebinding (§9.5).
func checkHost(port int, next http.Handler) http.Handler {
	p := strconv.Itoa(port)
	allowed := map[string]bool{"127.0.0.1:" + p: true, "localhost:" + p: true}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !allowed[strings.ToLower(r.Host)] {
			writeError(w, http.StatusForbidden, "forbidden", "Unexpected Host header.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// checkOrigin requires state-changing requests to come from the
// daemon's own pages (§9.5).
func checkOrigin(origin string, next http.Handler) http.Handler {
	alt := strings.Replace(origin, "127.0.0.1", "localhost", 1)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			o := r.Header.Get("Origin")
			if o != origin && o != alt {
				writeError(w, http.StatusForbidden, "forbidden", "Cross-origin request refused.")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// securityHeaders sets the Content Security Policy and related headers.
// style-src allows inline styles because CodeMirror injects its own
// stylesheet; scripts must still come from the daemon.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy",
			"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("write response: %v", err)
	}
}

// writeError writes the structured error format from §9.3.
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]string{"code": code, "message": message},
	})
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
