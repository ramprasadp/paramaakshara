// SPDX-License-Identifier: GPL-3.0-or-later

package server

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"sync"
)

// CookieName is the session cookie set by /auth (spec §9.5).
const CookieName = "pak_session"

// Auth holds the single-use launch token and the browser sessions it has
// been exchanged for.
type Auth struct {
	mu       sync.Mutex
	token    string
	sessions map[string]bool
	// onToken is called with each new launch token, so the caller can
	// write it to session.json for the next launch to use.
	onToken func(token string)
}

// NewAuth creates an Auth with a fresh launch token. onToken may be nil.
func NewAuth(onToken func(token string)) *Auth {
	a := &Auth{sessions: map[string]bool{}, onToken: onToken}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.rotateLocked()
	return a
}

// Token returns the current, unused launch token.
func (a *Auth) Token() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.token
}

// Redeem exchanges a launch token for a new session ID. The token is
// single-use: a fresh one replaces it.
func (a *Auth) Redeem(token string) (string, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if token == "" || subtle.ConstantTimeCompare([]byte(token), []byte(a.token)) != 1 {
		return "", false
	}
	session := randomHex()
	a.sessions[session] = true
	a.rotateLocked()
	return session, true
}

// Valid reports whether session is a session issued by Redeem.
func (a *Auth) Valid(session string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.sessions[session]
}

func (a *Auth) rotateLocked() {
	a.token = randomHex()
	if a.onToken != nil {
		a.onToken(a.token)
	}
}

// randomHex returns 32 random bytes as hex.
func randomHex() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand.Read does not fail on supported platforms
	}
	return hex.EncodeToString(b)
}
