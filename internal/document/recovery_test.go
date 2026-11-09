// SPDX-License-Identifier: GPL-3.0-or-later

package document

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRecoveryPutGetListDelete(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "recovery") // created by Put
	rc := NewRecovery(dir, 1<<20)
	project := json.RawMessage(`{"format":"paramaakshara","segments":[]}`)
	if err := rc.Put(Snapshot{Key: "abc-1", Name: "Untitled", Project: project}); err != nil {
		t.Fatal(err)
	}
	s, err := rc.Get("abc-1")
	if err != nil || string(s.Project) != string(project) || s.SavedAt.IsZero() {
		t.Fatalf("get: %+v %v", s, err)
	}
	list, _ := rc.List()
	if len(list) != 1 || list[0].Key != "abc-1" || list[0].Project != nil {
		t.Fatalf("list = %+v", list)
	}
	info, _ := os.Stat(dir)
	if info.Mode().Perm() != 0o700 {
		t.Errorf("recovery dir mode = %o, want 700", info.Mode().Perm())
	}
	if err := rc.Delete("abc-1"); err != nil {
		t.Fatal(err)
	}
	if _, err := rc.Get("abc-1"); code(err) != "not_found" {
		t.Fatalf("after delete: %v", err)
	}
	if err := rc.Delete("abc-1"); err != nil {
		t.Fatalf("deleting twice: %v", err)
	}
}

func TestRecoveryRejectsBadInput(t *testing.T) {
	rc := NewRecovery(t.TempDir(), 100)
	for _, key := range []string{"", "../x", "a/b", "a.json", string(make([]byte, 65))} {
		if err := rc.Put(Snapshot{Key: key, Project: json.RawMessage(`{}`)}); code(err) != "bad_request" {
			t.Errorf("key %q: %v", key, err)
		}
	}
	if err := rc.Put(Snapshot{Key: "k", Project: json.RawMessage(`{not json`)}); code(err) != "bad_request" {
		t.Errorf("invalid project: %v", err)
	}
	big := json.RawMessage(`"` + string(make([]byte, 200)) + `"`)
	if err := rc.Put(Snapshot{Key: "k", Project: big}); code(err) == "" {
		t.Errorf("oversized snapshot accepted")
	}
}

func TestRecoveryPrune(t *testing.T) {
	rc := NewRecovery(t.TempDir(), 1<<20)
	now := time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC)
	rc.now = func() time.Time { return now.Add(-40 * 24 * time.Hour) }
	rc.Put(Snapshot{Key: "old", Project: json.RawMessage(`{}`)})
	rc.now = func() time.Time { return now }
	rc.Put(Snapshot{Key: "new", Project: json.RawMessage(`{}`)})
	if err := rc.Prune(30 * 24 * time.Hour); err != nil {
		t.Fatal(err)
	}
	list, _ := rc.List()
	if len(list) != 1 || list[0].Key != "new" {
		t.Fatalf("after prune: %+v", list)
	}
}
