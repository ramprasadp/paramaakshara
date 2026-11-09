// SPDX-License-Identifier: GPL-3.0-or-later

package server

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/ramprasadp/paramaakshara/internal/config"
	"github.com/ramprasadp/paramaakshara/internal/document"
)

// ClientConfig is what GET /api/config returns: editor settings and the
// read-only facts the browser needs (§9.3). Folder paths stay private.
type ClientConfig struct {
	Roots                   []string      `json:"roots"`
	MaxDocumentBytes        int64         `json:"max_document_bytes"`
	RecoveryIntervalSeconds int           `json:"recovery_interval_seconds"`
	Editor                  config.Editor `json:"editor"`
}

type api struct {
	store    *document.Store
	recovery *document.Recovery
	client   ClientConfig
}

func (a *api) routes(mux *http.ServeMux, auth *Auth) {
	handle := func(pattern string, h http.HandlerFunc) {
		mux.Handle(pattern, requireSession(auth, h))
	}
	handle("GET /api/config", a.getConfig)
	handle("GET /api/documents", a.listDocuments)
	handle("GET /api/document", a.openDocument)
	handle("PUT /api/document", a.saveDocument)
	handle("GET /api/recovery", a.listRecovery)
	handle("GET /api/recovery/{key}", a.getRecovery)
	handle("PUT /api/recovery/{key}", a.putRecovery)
	handle("DELETE /api/recovery/{key}", a.deleteRecovery)
}

func (a *api) getConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, a.client)
}

func (a *api) listDocuments(w http.ResponseWriter, r *http.Request) {
	entries, err := a.store.List(r.URL.Query().Get("root"))
	if err != nil {
		writeFailure(w, r, err)
		return
	}
	if entries == nil {
		entries = []document.Entry{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

func (a *api) openDocument(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	doc, err := a.store.Open(q.Get("root"), q.Get("path"))
	if err != nil {
		writeFailure(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

type saveRequest struct {
	Root         string `json:"root"`
	Path         string `json:"path"`
	BaseRevision string `json:"base_revision"`
	Content      string `json:"content"`
	BOM          bool   `json:"bom"`
	LineEnding   string `json:"line_ending"`
}

func (a *api) saveDocument(w http.ResponseWriter, r *http.Request) {
	var req saveRequest
	if !a.decode(w, r, &req) {
		return
	}
	if req.LineEnding == "" {
		req.LineEnding = "lf"
	}
	rev, err := a.store.Save(req.Root, req.Path, req.BaseRevision, req.Content, req.BOM, req.LineEnding)
	if err != nil {
		writeFailure(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"revision": rev})
}

func (a *api) listRecovery(w http.ResponseWriter, r *http.Request) {
	list, err := a.recovery.List()
	if err != nil {
		writeFailure(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"snapshots": list})
}

func (a *api) getRecovery(w http.ResponseWriter, r *http.Request) {
	s, err := a.recovery.Get(r.PathValue("key"))
	if err != nil {
		writeFailure(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, s)
}

func (a *api) putRecovery(w http.ResponseWriter, r *http.Request) {
	var s document.Snapshot
	if !a.decode(w, r, &s) {
		return
	}
	s.Key = r.PathValue("key")
	if err := a.recovery.Put(s); err != nil {
		writeFailure(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *api) deleteRecovery(w http.ResponseWriter, r *http.Request) {
	if err := a.recovery.Delete(r.PathValue("key")); err != nil {
		writeFailure(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// decode reads a JSON body no larger than a document allows.
func (a *api) decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 2*a.client.MaxDocumentBytes+1<<20)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, "too_large", "The request is larger than the document size limit.")
		} else {
			writeError(w, http.StatusBadRequest, "bad_request", "The request body is not valid JSON.")
		}
		return false
	}
	return true
}

var statusFor = map[string]int{
	"bad_request":  http.StatusBadRequest,
	"not_found":    http.StatusNotFound,
	"conflict":     http.StatusConflict,
	"too_large":    http.StatusRequestEntityTooLarge,
	"invalid_utf8": http.StatusUnprocessableEntity,
}

// writeFailure maps store errors to the structured format from §9.3.
// Unexpected errors are logged (never with document content) and
// reported as "internal".
func writeFailure(w http.ResponseWriter, r *http.Request, err error) {
	var e *document.Error
	if errors.As(err, &e) {
		body := map[string]string{"code": e.Code, "message": e.Message}
		if e.Code == "conflict" {
			body["current_revision"] = e.CurrentRevision
		}
		writeJSON(w, statusFor[e.Code], map[string]any{"error": body})
		return
	}
	log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
	writeError(w, http.StatusInternalServerError, "internal", "Something went wrong; see the log file.")
}
