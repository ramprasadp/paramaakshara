// SPDX-License-Identifier: GPL-3.0-or-later

package folder

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestQuoting(t *testing.T) {
	if got := appleString(`a "b" \c`); got != `"a \"b\" \\c"` {
		t.Errorf("appleString = %s", got)
	}
	if got := psString(`it's`); got != `'it''s'` {
		t.Errorf("psString = %s", got)
	}
}

func TestMacCommandPassesPathsAsStrings(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("macOS picker")
	}
	name, args, err := command("Export to", `/Users/x/"quoted"`, false)
	if err != nil || name != "osascript" {
		t.Fatalf("%s %v", name, err)
	}
	script := strings.Join(args, " ")
	if !strings.Contains(script, `set d to POSIX file "/Users/x/\"quoted\""`) ||
		!strings.Contains(script, "choose folder with prompt p default location d") {
		t.Errorf("script = %s", script)
	}
	_, args, _ = command("Open", "/Users/x", true)
	if script := strings.Join(args, " "); !strings.Contains(script, "choose file with prompt p default location d") {
		t.Errorf("file script = %s", script)
	}
}

func TestCheckFile(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "a.itx")
	os.WriteFile(file, nil, 0o600)
	if got, err := checkFile(file); err != nil || got != file {
		t.Errorf("checkFile(file) = %q, %v", got, err)
	}
	for _, p := range []string{"relative.itx", dir, filepath.Join(dir, "missing.itx")} {
		if _, err := checkFile(p); err == nil {
			t.Errorf("checkFile(%q) accepted", p)
		}
	}
}

func TestCheckDir(t *testing.T) {
	dir := t.TempDir()
	if got, err := checkDir(dir + "/"); err != nil || got != filepath.Clean(dir) {
		t.Errorf("checkDir(dir/) = %q, %v", got, err)
	}
	file := filepath.Join(dir, "f")
	os.WriteFile(file, nil, 0o600)
	for _, p := range []string{"relative", file, filepath.Join(dir, "missing")} {
		if _, err := checkDir(p); err == nil {
			t.Errorf("checkDir(%q) accepted", p)
		}
	}
}
