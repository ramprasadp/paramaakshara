// SPDX-License-Identifier: GPL-3.0-or-later

// Package instance handles session.json, detection of an already running
// daemon and opening the browser (spec §9.7).
package instance

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"time"
)

// Session is the content of session.json. Token is an unused launch
// token, so a second launch can open the browser on this instance.
type Session struct {
	Port  int    `json:"port"`
	PID   int    `json:"pid"`
	Token string `json:"token"`
}

// AuthURL is the link that signs a browser in to the daemon.
func (s Session) AuthURL() string {
	return "http://127.0.0.1:" + strconv.Itoa(s.Port) + "/auth?token=" + s.Token
}

// WriteSession writes s to path with mode 0600, replacing it atomically.
func WriteSession(path string, s Session) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.Marshal(s)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".session-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name()) // no-op after a successful rename
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// ReadSession reads session.json.
func ReadSession(path string) (Session, error) {
	var s Session
	data, err := os.ReadFile(path)
	if err != nil {
		return s, err
	}
	err = json.Unmarshal(data, &s)
	return s, err
}

// IsParamaakshara reports whether a Paramaakshara daemon answers on port.
func IsParamaakshara(port int) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	url := "http://127.0.0.1:" + strconv.Itoa(port) + "/api/health"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	var h struct {
		App string `json:"app"`
	}
	return resp.StatusCode == http.StatusOK &&
		json.NewDecoder(resp.Body).Decode(&h) == nil &&
		h.App == "paramaakshara"
}

// OpenBrowser opens url in the default browser. It runs the opener
// directly, never through a shell.
func OpenBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux", "freebsd", "openbsd", "netbsd":
		cmd = exec.Command("xdg-open", url)
	default:
		return errors.New("opening a browser is not supported on " + runtime.GOOS)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("%s: %w", cmd.Path, err)
	}
	go func() { _ = cmd.Wait() }()
	return nil
}
