// SPDX-License-Identifier: GPL-3.0-or-later

package document

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Snapshot is unsaved work sent by the browser (spec §10.4). Project is
// the project file content as JSON; the daemon does not interpret it.
type Snapshot struct {
	Key          string          `json:"key"`
	SavedAt      time.Time       `json:"saved_at"`
	Name         string          `json:"name"`
	Root         string          `json:"root,omitempty"`
	Path         string          `json:"path,omitempty"`
	BaseRevision string          `json:"base_revision,omitempty"`
	Project      json.RawMessage `json:"project,omitempty"`
}

// Recovery stores snapshots as <dir>/<key>.json.
type Recovery struct {
	dir      string
	maxBytes int64
	now      func() time.Time
}

var keyPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func NewRecovery(dir string, maxBytes int64) *Recovery {
	return &Recovery{dir: dir, maxBytes: maxBytes, now: time.Now}
}

func checkKey(key string) error {
	if !keyPattern.MatchString(key) {
		return errorf("bad_request", "Invalid recovery key.")
	}
	return nil
}

func (rc *Recovery) root() (*os.Root, error) {
	if err := os.MkdirAll(rc.dir, 0o700); err != nil {
		return nil, err
	}
	return os.OpenRoot(rc.dir)
}

// Put stores a snapshot, replacing any with the same key.
func (rc *Recovery) Put(s Snapshot) error {
	if err := checkKey(s.Key); err != nil {
		return err
	}
	if len(s.Project) == 0 || !json.Valid(s.Project) {
		return errorf("bad_request", "The snapshot has no valid project.")
	}
	if int64(len(s.Project)) > rc.maxBytes {
		return errorf("too_large", "The snapshot is larger than the document size limit.")
	}
	s.SavedAt = rc.now().UTC()
	data, err := json.Marshal(s)
	if err != nil {
		return err
	}
	r, err := rc.root()
	if err != nil {
		return err
	}
	defer r.Close()
	return writeAtomic(r, s.Key+".json", data)
}

// Get returns one snapshot.
func (rc *Recovery) Get(key string) (Snapshot, error) {
	var s Snapshot
	if err := checkKey(key); err != nil {
		return s, err
	}
	r, err := rc.root()
	if err != nil {
		return s, err
	}
	defer r.Close()
	data, err := r.ReadFile(key + ".json")
	if errors.Is(err, fs.ErrNotExist) {
		return s, errorf("not_found", "No recovery snapshot %q.", key)
	}
	if err != nil {
		return s, err
	}
	err = json.Unmarshal(data, &s)
	return s, err
}

// List returns all snapshots without their project content, newest first.
func (rc *Recovery) List() ([]Snapshot, error) {
	r, err := rc.root()
	if err != nil {
		return nil, err
	}
	defer r.Close()
	entries, err := fs.ReadDir(r.FS(), ".")
	if err != nil {
		return nil, err
	}
	out := []Snapshot{}
	for _, e := range entries {
		key, ok := strings.CutSuffix(e.Name(), ".json")
		if !ok || !keyPattern.MatchString(key) {
			continue
		}
		s, err := rc.Get(key)
		if err != nil {
			continue
		}
		s.Project = nil
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].SavedAt.After(out[j].SavedAt) })
	return out, nil
}

// Delete removes a snapshot; a missing one is not an error.
func (rc *Recovery) Delete(key string) error {
	if err := checkKey(key); err != nil {
		return err
	}
	r, err := rc.root()
	if err != nil {
		return err
	}
	defer r.Close()
	if err := r.Remove(key + ".json"); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
}

// Prune deletes snapshots older than retention.
func (rc *Recovery) Prune(retention time.Duration) error {
	list, err := rc.List()
	if err != nil {
		return err
	}
	cutoff := rc.now().Add(-retention)
	for _, s := range list {
		if s.SavedAt.Before(cutoff) {
			if err := rc.Delete(s.Key); err != nil {
				return err
			}
		}
	}
	return nil
}
