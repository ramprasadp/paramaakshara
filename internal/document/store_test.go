// SPDX-License-Identifier: GPL-3.0-or-later

package document

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ramprasadp/paramaakshara/internal/config"
)

type fixture struct {
	store   *Store
	docs    string
	backups string
}

func newFixture(t *testing.T) fixture {
	t.Helper()
	base := t.TempDir()
	f := fixture{docs: filepath.Join(base, "docs"), backups: filepath.Join(base, "backups")}
	s, err := NewStore([]config.Root{{Name: "Documents", Path: f.docs}}, 1<<20, 2, f.backups)
	if err != nil {
		t.Fatal(err)
	}
	f.store = s
	return f
}

func (f fixture) write(t *testing.T, rel string, data []byte) {
	t.Helper()
	p := filepath.Join(f.docs, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func code(err error) string {
	var e *Error
	if errors.As(err, &e) {
		return e.Code
	}
	return ""
}

func TestCreatesMissingFolder(t *testing.T) {
	f := newFixture(t)
	if info, err := os.Stat(f.docs); err != nil || !info.IsDir() {
		t.Fatalf("document folder not created: %v", err)
	}
}

func TestSaveNewThenOpen(t *testing.T) {
	f := newFixture(t)
	content := "स॒हस्र॑शीर्षा॒ पुरु॑षः\nस भूमिं॑\n"
	rev, err := f.store.Save("Documents", "rv/10-90.txt", "", content, false, "lf")
	if err != nil {
		t.Fatal(err)
	}
	doc, err := f.store.Open("Documents", "rv/10-90.txt")
	if err != nil {
		t.Fatal(err)
	}
	if doc.Content != content || doc.Revision != rev || doc.BOM || doc.LineEnding != "lf" {
		t.Fatalf("doc = %+v", doc)
	}
	raw, _ := os.ReadFile(filepath.Join(f.docs, "rv", "10-90.txt"))
	if string(raw) != content {
		t.Fatal("bytes on disk differ from the content")
	}
}

func TestExactBytesPreserved(t *testing.T) {
	f := newFixture(t)
	// Combining marks in an unusual order, ZWJ, ZWNJ and a decomposed
	// sequence: nothing may be normalised.
	content := "भूमि॑ं क्‍ष क्‌ष क़"
	if _, err := f.store.Save("Documents", "a.txt", "", content, false, "lf"); err != nil {
		t.Fatal(err)
	}
	doc, _ := f.store.Open("Documents", "a.txt")
	if doc.Content != content {
		t.Fatalf("content changed: %q", doc.Content)
	}
}

func TestBOMAndCRLFRoundTrip(t *testing.T) {
	f := newFixture(t)
	original := append([]byte{0xEF, 0xBB, 0xBF}, []byte("एक\r\nदो\r\n")...)
	f.write(t, "w.txt", original)
	doc, err := f.store.Open("Documents", "w.txt")
	if err != nil {
		t.Fatal(err)
	}
	if !doc.BOM || doc.LineEnding != "crlf" || doc.Content != "एक\nदो\n" {
		t.Fatalf("doc = %+v", doc)
	}
	if _, err := f.store.Save("Documents", "w.txt", doc.Revision, doc.Content+"तीन\n", doc.BOM, doc.LineEnding); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(filepath.Join(f.docs, "w.txt"))
	want := append([]byte{0xEF, 0xBB, 0xBF}, []byte("एक\r\nदो\r\nतीन\r\n")...)
	if string(raw) != string(want) {
		t.Fatalf("bytes = %q", raw)
	}
}

func TestInvalidUTF8IsRejectedNotReplaced(t *testing.T) {
	f := newFixture(t)
	f.write(t, "bad.txt", []byte("ok \xff\xfe bad"))
	_, err := f.store.Open("Documents", "bad.txt")
	if code(err) != "invalid_utf8" || !strings.Contains(err.Error(), "offset 3") {
		t.Fatalf("err = %v", err)
	}
	if _, err := f.store.Save("Documents", "x.txt", "", "a\xffb", false, "lf"); code(err) != "invalid_utf8" {
		t.Fatalf("save err = %v", err)
	}
}

func TestConflicts(t *testing.T) {
	f := newFixture(t)
	rev, _ := f.store.Save("Documents", "c.txt", "", "one", false, "lf")
	// Saving as new over an existing file.
	if _, err := f.store.Save("Documents", "c.txt", "", "two", false, "lf"); code(err) != "conflict" {
		t.Fatalf("new over existing: %v", err)
	}
	// Changed on disk by another program.
	f.write(t, "c.txt", []byte("changed elsewhere"))
	_, err := f.store.Save("Documents", "c.txt", rev, "two", false, "lf")
	var e *Error
	if !errors.As(err, &e) || e.Code != "conflict" || e.CurrentRevision != Revision([]byte("changed elsewhere")) {
		t.Fatalf("changed on disk: %v", err)
	}
	raw, _ := os.ReadFile(filepath.Join(f.docs, "c.txt"))
	if string(raw) != "changed elsewhere" {
		t.Fatal("conflicting save wrote the file")
	}
	// Deleted on disk.
	os.Remove(filepath.Join(f.docs, "c.txt"))
	if _, err := f.store.Save("Documents", "c.txt", rev, "two", false, "lf"); code(err) != "conflict" {
		t.Fatalf("deleted on disk: %v", err)
	}
}

func TestBackupsKeepNewest(t *testing.T) {
	f := newFixture(t)
	tick := time.Date(2026, 11, 9, 10, 0, 0, 0, time.UTC)
	f.store.now = func() time.Time { tick = tick.Add(time.Second); return tick }
	rev, _ := f.store.Save("Documents", "sub/b.txt", "", "v1", false, "lf")
	for _, v := range []string{"v2", "v3", "v4"} {
		var err error
		if rev, err = f.store.Save("Documents", "sub/b.txt", rev, v, false, "lf"); err != nil {
			t.Fatal(err)
		}
	}
	entries, _ := os.ReadDir(filepath.Join(f.backups, "Documents", "sub"))
	var got []string
	for _, e := range entries {
		data, _ := os.ReadFile(filepath.Join(f.backups, "Documents", "sub", e.Name()))
		got = append(got, string(data))
	}
	if strings.Join(got, ",") != "v2,v3" {
		t.Fatalf("backups = %v; want the two newest previous versions v2,v3", got)
	}
}

func TestUnchangedSaveWritesNothing(t *testing.T) {
	f := newFixture(t)
	rev, _ := f.store.Save("Documents", "u.txt", "", "same", false, "lf")
	rev2, err := f.store.Save("Documents", "u.txt", rev, "same", false, "lf")
	if err != nil || rev2 != rev {
		t.Fatalf("rev2=%s err=%v", rev2, err)
	}
	if _, err := os.Stat(filepath.Join(f.backups, "Documents")); !os.IsNotExist(err) {
		t.Fatal("an unchanged save made a backup")
	}
}

func TestPathSafety(t *testing.T) {
	f := newFixture(t)
	outside := filepath.Join(filepath.Dir(f.docs), "secret.txt")
	os.WriteFile(outside, []byte("secret"), 0o644)
	if err := os.Symlink(outside, filepath.Join(f.docs, "link.txt")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Dir(f.docs), filepath.Join(f.docs, "up")); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{"../secret.txt", "/etc/hosts.txt", "a/../../secret.txt", `a\b.txt`, "./a.txt", "a//b.txt", ""} {
		if _, err := f.store.Open("Documents", p); code(err) != "bad_request" {
			t.Errorf("open %q: err = %v, want bad_request", p, err)
		}
		if _, err := f.store.Save("Documents", p, "", "x", false, "lf"); code(err) != "bad_request" {
			t.Errorf("save %q: err = %v, want bad_request", p, err)
		}
	}
	// Symlinks that leave the folder are refused by os.Root.
	if doc, err := f.store.Open("Documents", "link.txt"); err == nil {
		t.Errorf("followed a symlink out of the folder: %q", doc.Content)
	}
	if _, err := f.store.Save("Documents", "up/secret.txt", "", "x", false, "lf"); err == nil {
		t.Error("wrote through a symlinked directory out of the folder")
	}
	if raw, _ := os.ReadFile(outside); string(raw) != "secret" {
		t.Fatal("file outside the folder was modified")
	}
	if _, err := f.store.Open("Elsewhere", "a.txt"); code(err) != "not_found" {
		t.Errorf("unknown folder: %v", err)
	}
	for _, p := range []string{"notes.md", "x.json", ".txt", "script.sh"} {
		if _, err := f.store.Save("Documents", p, "", "x", false, "lf"); code(err) != "bad_request" {
			t.Errorf("save %q: err = %v, want bad_request for unsupported type", p, err)
		}
	}
}

func TestSizeLimit(t *testing.T) {
	f := newFixture(t)
	big := strings.Repeat("क", (1<<20)/3+1)
	if _, err := f.store.Save("Documents", "big.txt", "", big, false, "lf"); code(err) != "too_large" {
		t.Fatalf("save: %v", err)
	}
	f.write(t, "big.txt", []byte(big))
	if _, err := f.store.Open("Documents", "big.txt"); code(err) != "too_large" {
		t.Fatalf("open: %v", err)
	}
}

func TestListSupportedFilesOnly(t *testing.T) {
	f := newFixture(t)
	for _, p := range []string{"a.txt", "sub/b.paramaakshara.json", "c.itx", "d.md", ".hidden.txt", ".git/e.txt", "sub/.x.txt.tmp-1"} {
		f.write(t, p, []byte("x"))
	}
	entries, err := f.store.List("Documents")
	if err != nil {
		t.Fatal(err)
	}
	var paths []string
	for _, e := range entries {
		paths = append(paths, e.Path)
	}
	if strings.Join(paths, ",") != "a.txt,c.itx,sub/b.paramaakshara.json" {
		t.Fatalf("listed %v", paths)
	}
}

func TestNoTemporaryFilesLeft(t *testing.T) {
	f := newFixture(t)
	rev, _ := f.store.Save("Documents", "t.txt", "", "1", false, "lf")
	f.store.Save("Documents", "t.txt", rev, "2", false, "lf")
	entries, _ := os.ReadDir(f.docs)
	if len(entries) != 1 {
		t.Fatalf("folder has %d entries, want only t.txt", len(entries))
	}
}
