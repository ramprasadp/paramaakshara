// SPDX-License-Identifier: GPL-3.0-or-later

// Package config loads and validates the daemon configuration (spec §9.6).
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net"
	"os"
	"reflect"
	"sort"
	"strings"
)

// Config mirrors config.json. Every key is optional in the file.
type Config struct {
	Server    Server    `json:"server"`
	Documents Documents `json:"documents"`
	Recovery  Recovery  `json:"recovery"`
	Logging   Logging   `json:"logging"`
	PDF       PDF       `json:"pdf"`
	Editor    Editor    `json:"editor"`
}

type Server struct {
	ListenAddress string `json:"listen_address"`
	Port          int    `json:"port"`
	OpenBrowser   bool   `json:"open_browser"`
	// Container is set from PARAMAAKSHARA_CONTAINER, never from the file.
	// It allows listening on all interfaces inside a container whose port
	// is published on the host's loopback only (docker/compose.yaml).
	Container bool `json:"-"`
}

type Root struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type Documents struct {
	Roots            []Root `json:"roots"`
	MaxDocumentBytes int64  `json:"max_document_bytes"`
	BackupCount      int    `json:"backup_count"`
}

type Recovery struct {
	IntervalSeconds int `json:"interval_seconds"`
	RetentionDays   int `json:"retention_days"`
}

type Logging struct {
	// File is the log file path. Empty means the per-OS default; "-"
	// means standard error.
	File       string `json:"file"`
	MaxBackups int    `json:"max_backups"`
}

// PDF configures how Export all makes PDFs (spec §10.1b).
type PDF struct {
	// Browser is the Chrome, Edge or Chromium executable run headless.
	// Empty means search the usual install locations.
	Browser string `json:"browser"`
}

// Editor holds the settings the browser may change (spec §9.5).
type Editor struct {
	InputScheme     string            `json:"input_scheme"`
	OutputScript    string            `json:"output_script"`
	TamilConvention string            `json:"tamil_convention"`
	VedicTradition  string            `json:"vedic_tradition"`
	Digits          string            `json:"digits"`
	Fonts           map[string]string `json:"fonts"`
	FontSizePx      int               `json:"font_size_px"`
	Layout          string            `json:"layout"`
	AutosaveToFile  bool              `json:"autosave_to_file"`
}

// Default returns the built-in defaults. documentDir is the default
// document folder from DefaultPaths.
func Default(documentDir string) Config {
	return Config{
		Server: Server{ListenAddress: "127.0.0.1", Port: 7531, OpenBrowser: true},
		Documents: Documents{
			Roots:            []Root{{Name: "Documents", Path: documentDir}},
			MaxDocumentBytes: 10 << 20,
			BackupCount:      5,
		},
		Recovery: Recovery{IntervalSeconds: 15, RetentionDays: 30},
		Logging:  Logging{MaxBackups: 14},
		Editor: Editor{
			InputScheme:     "itrans",
			OutputScript:    "devanagari",
			TamilConvention: "superscript",
			VedicTradition:  "rigveda",
			Digits:          "devanagari",
			Fonts: map[string]string{
				"devanagari": "Noto Serif Devanagari",
				"kannada":    "Noto Serif Kannada",
				"tamil":      "Noto Serif Tamil",
			},
			FontSizePx: 20,
			Layout:     "side-by-side",
		},
	}
}

// Load reads path on top of base. A missing file is not an error unless
// required is set. It returns warnings for unknown keys.
func Load(path string, base Config, required bool) (Config, []string, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) && !required {
		return base, nil, nil
	}
	if err != nil {
		return base, nil, err
	}
	cfg := base
	if err := json.Unmarshal(data, &cfg); err != nil {
		return base, nil, fmt.Errorf("%s: %w", path, err)
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return base, nil, fmt.Errorf("%s: %w", path, err)
	}
	var warnings []string
	for _, key := range unknownKeys(reflect.TypeOf(cfg), raw, "") {
		warnings = append(warnings, fmt.Sprintf("%s: unknown key %q ignored", path, key))
	}
	return cfg, warnings, nil
}

// unknownKeys lists keys in raw that have no matching json tag in t.
// Maps (such as editor.fonts) accept any key.
func unknownKeys(t reflect.Type, raw map[string]any, prefix string) []string {
	fields := map[string]reflect.Type{}
	for i := range t.NumField() {
		f := t.Field(i)
		name, _, _ := strings.Cut(f.Tag.Get("json"), ",")
		fields[name] = f.Type
	}
	var out []string
	for key, val := range raw {
		ft, ok := fields[key]
		if !ok {
			out = append(out, prefix+key)
			continue
		}
		if sub, isObj := val.(map[string]any); isObj && ft.Kind() == reflect.Struct {
			out = append(out, unknownKeys(ft, sub, prefix+key+".")...)
		}
	}
	sort.Strings(out)
	return out
}

// Validate checks the values the daemon depends on. Errors name the key.
func (c *Config) Validate() error {
	ip := net.ParseIP(c.Server.ListenAddress)
	if ip == nil || !(ip.IsLoopback() || (c.Server.Container && ip.IsUnspecified())) {
		return fmt.Errorf("server.listen_address %q: must be a loopback IP address such as 127.0.0.1", c.Server.ListenAddress)
	}
	if c.Server.Port < 1024 || c.Server.Port > 65535 {
		return fmt.Errorf("server.port %d: must be between 1024 and 65535", c.Server.Port)
	}
	if len(c.Documents.Roots) == 0 {
		return errors.New("documents.roots: at least one document folder is required")
	}
	names := map[string]bool{}
	for i, r := range c.Documents.Roots {
		if r.Name == "" || r.Path == "" {
			return fmt.Errorf("documents.roots[%d]: name and path are required", i)
		}
		if names[r.Name] {
			return fmt.Errorf("documents.roots[%d]: duplicate name %q", i, r.Name)
		}
		names[r.Name] = true
	}
	if c.Documents.MaxDocumentBytes <= 0 {
		return fmt.Errorf("documents.max_document_bytes %d: must be positive", c.Documents.MaxDocumentBytes)
	}
	if c.Documents.BackupCount < 0 {
		return fmt.Errorf("documents.backup_count %d: must not be negative", c.Documents.BackupCount)
	}
	if c.Recovery.IntervalSeconds <= 0 {
		return fmt.Errorf("recovery.interval_seconds %d: must be positive", c.Recovery.IntervalSeconds)
	}
	if c.Recovery.RetentionDays <= 0 {
		return fmt.Errorf("recovery.retention_days %d: must be positive", c.Recovery.RetentionDays)
	}
	if c.Logging.MaxBackups < 0 {
		return fmt.Errorf("logging.max_backups %d: must not be negative", c.Logging.MaxBackups)
	}
	return nil
}

// ExpandPaths expands "~" in document roots and the log file path.
func (c *Config) ExpandPaths() error {
	for i := range c.Documents.Roots {
		p, err := ExpandHome(c.Documents.Roots[i].Path)
		if err != nil {
			return err
		}
		c.Documents.Roots[i].Path = p
	}
	p, err := ExpandHome(c.Logging.File)
	if err != nil {
		return err
	}
	c.Logging.File = p
	if c.PDF.Browser, err = ExpandHome(c.PDF.Browser); err != nil {
		return err
	}
	return nil
}
