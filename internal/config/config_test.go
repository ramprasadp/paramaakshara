// SPDX-License-Identifier: GPL-3.0-or-later

package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeFile(t *testing.T, content string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(p, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestDefaultsAreValid(t *testing.T) {
	c := Default("/docs")
	if err := c.Validate(); err != nil {
		t.Fatal(err)
	}
	if c.Server.Port != 7531 || c.Server.ListenAddress != "127.0.0.1" || !c.Server.OpenBrowser {
		t.Fatalf("server defaults = %+v", c.Server)
	}
}

func TestMissingFile(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "none.json")
	c, warnings, err := Load(missing, Default("/docs"), false)
	if err != nil || len(warnings) != 0 || c.Server.Port != 7531 {
		t.Fatalf("optional missing file: c.Port=%d warnings=%v err=%v", c.Server.Port, warnings, err)
	}
	if _, _, err := Load(missing, Default("/docs"), true); err == nil {
		t.Fatal("required missing file: want error")
	}
}

func TestFileOverridesOnlyGivenKeys(t *testing.T) {
	p := writeFile(t, `{
		"server": {"port": 9333},
		"logging": {"file": "/var/log/apps/paramaakshara.log"},
		"editor": {"fonts": {"devanagari": "Shobhika"}}
	}`)
	c, warnings, err := Load(p, Default("/docs"), true)
	if err != nil || len(warnings) != 0 {
		t.Fatalf("warnings=%v err=%v", warnings, err)
	}
	if c.Server.Port != 9333 || c.Server.ListenAddress != "127.0.0.1" || !c.Server.OpenBrowser {
		t.Fatalf("server = %+v", c.Server)
	}
	if c.Logging.File != "/var/log/apps/paramaakshara.log" || c.Logging.MaxBackups != 14 {
		t.Fatalf("logging = %+v", c.Logging)
	}
	if c.Editor.Fonts["devanagari"] != "Shobhika" || c.Editor.Fonts["tamil"] != "Noto Serif Tamil" {
		t.Fatalf("fonts = %v", c.Editor.Fonts)
	}
	if len(c.Documents.Roots) != 1 || c.Documents.Roots[0].Path != "/docs" {
		t.Fatalf("roots = %v", c.Documents.Roots)
	}
}

func TestUnknownKeysWarn(t *testing.T) {
	p := writeFile(t, `{"server": {"prot": 1}, "colour": "red", "editor": {"fonts": {"grantha": "X"}}}`)
	_, warnings, err := Load(p, Default("/docs"), true)
	if err != nil {
		t.Fatal(err)
	}
	got := strings.Join(warnings, "\n")
	if len(warnings) != 2 || !strings.Contains(got, `"colour"`) || !strings.Contains(got, `"server.prot"`) {
		t.Fatalf("warnings = %v; want colour and server.prot only", warnings)
	}
}

func TestInvalidJSON(t *testing.T) {
	p := writeFile(t, `{"server": {"port": "seven"}}`)
	if _, _, err := Load(p, Default("/docs"), true); err == nil {
		t.Fatal("want error for a string port")
	}
}

func TestValidateNamesTheKey(t *testing.T) {
	cases := []struct {
		edit func(*Config)
		key  string
	}{
		{func(c *Config) { c.Server.ListenAddress = "0.0.0.0" }, "server.listen_address"},
		{func(c *Config) { c.Server.ListenAddress = "192.168.1.5" }, "server.listen_address"},
		{func(c *Config) { c.Server.ListenAddress = "localhost" }, "server.listen_address"},
		{func(c *Config) { c.Server.Port = 80 }, "server.port"},
		{func(c *Config) { c.Server.Port = 70000 }, "server.port"},
		{func(c *Config) { c.Documents.Roots = nil }, "documents.roots"},
		{func(c *Config) { c.Documents.Roots = append(c.Documents.Roots, c.Documents.Roots[0]) }, "documents.roots[1]"},
		{func(c *Config) { c.Documents.MaxDocumentBytes = 0 }, "documents.max_document_bytes"},
		{func(c *Config) { c.Documents.BackupCount = -1 }, "documents.backup_count"},
		{func(c *Config) { c.Recovery.IntervalSeconds = 0 }, "recovery.interval_seconds"},
		{func(c *Config) { c.Logging.MaxBackups = -1 }, "logging.max_backups"},
	}
	for _, tc := range cases {
		c := Default("/docs")
		tc.edit(&c)
		err := c.Validate()
		if err == nil || !strings.HasPrefix(err.Error(), tc.key) {
			t.Errorf("want error naming %s, got %v", tc.key, err)
		}
	}
	c := Default("/docs")
	c.Server.ListenAddress = "::1"
	if err := c.Validate(); err != nil {
		t.Errorf("::1 is loopback: %v", err)
	}
}

func TestExpandPaths(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	c := Default("~/Documents/Paramaakshara")
	c.Logging.File = "~/logs/p.log"
	if err := c.ExpandPaths(); err != nil {
		t.Fatal(err)
	}
	if c.Documents.Roots[0].Path != filepath.Join(home, "Documents", "Paramaakshara") {
		t.Errorf("root = %s", c.Documents.Roots[0].Path)
	}
	if c.Logging.File != filepath.Join(home, "logs", "p.log") {
		t.Errorf("log = %s", c.Logging.File)
	}
	c.PDF.Browser = "~/bin/chromium"
	if err := c.ExpandPaths(); err != nil || c.PDF.Browser != filepath.Join(home, "bin", "chromium") {
		t.Errorf("pdf.browser = %s, %v", c.PDF.Browser, err)
	}
	c.Logging.File = "-"
	if err := c.ExpandPaths(); err != nil || c.Logging.File != "-" {
		t.Errorf("stderr marker changed: %q %v", c.Logging.File, err)
	}
}

func TestContainerAllowsOnlyAllInterfaces(t *testing.T) {
	c := Default("/docs")
	c.Server.ListenAddress = "0.0.0.0"
	if err := c.Validate(); err == nil {
		t.Fatal("0.0.0.0 accepted outside container mode")
	}
	c.Server.Container = true
	if err := c.Validate(); err != nil {
		t.Fatalf("0.0.0.0 in container mode: %v", err)
	}
	c.Server.ListenAddress = "192.168.1.5"
	if err := c.Validate(); err == nil {
		t.Fatal("a LAN address accepted in container mode")
	}
}
