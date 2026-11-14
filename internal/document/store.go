// SPDX-License-Identifier: GPL-3.0-or-later

// Package document opens and saves documents inside the configured
// document folders (spec §9.4). All file access goes through os.Root, so
// paths cannot escape a folder by "..", absolute paths or symlinks.
package document

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/ramprasadp/paramaakshara/internal/config"
)

// Extensions are the file types the editor lists, opens and saves.
var Extensions = []string{".paramaakshara.json", ".txt", ".itx"}

// Error is a failure with one of the API error codes from spec §9.3.
type Error struct {
	Code    string
	Message string
	// CurrentRevision is set for "conflict".
	CurrentRevision string
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func errorf(code, format string, args ...any) *Error {
	return &Error{Code: code, Message: fmt.Sprintf(format, args...)}
}

// Store gives access to the document folders.
type Store struct {
	mu          sync.RWMutex
	roots       map[string]string // name -> absolute directory
	maxBytes    int64
	backupCount int
	backupsDir  string
	now         func() time.Time
}

// NewStore creates missing document folders.
func NewStore(roots []config.Root, maxBytes int64, backupCount int, backupsDir string) (*Store, error) {
	s := &Store{roots: map[string]string{}, maxBytes: maxBytes, backupCount: backupCount, backupsDir: backupsDir, now: time.Now}
	for _, r := range roots {
		if err := os.MkdirAll(r.Path, 0o755); err != nil {
			return nil, fmt.Errorf("document folder %s: %w", r.Path, err)
		}
		s.roots[r.Name] = r.Path
	}
	return s, nil
}

// AddPicked makes a folder the user chose in the system folder picker
// usable until the daemon stops, under a random name that the browser
// uses as the root. Picking the same folder again gives the same name.
func (s *Store) AddPicked(dir string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	for name, d := range s.roots {
		if d == dir && strings.HasPrefix(name, PickedPrefix) {
			return name
		}
	}
	name := PickedPrefix + randomSuffix()
	s.roots[name] = dir
	return name
}

// Dir returns the directory of a document folder.
func (s *Store) Dir(root string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	dir, ok := s.roots[root]
	return dir, ok
}

// PickedPrefix starts the names of picked folders.
const PickedPrefix = "picked-"

// Entry is one listed document.
type Entry struct {
	Path     string    `json:"path"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
}

// Document is an opened file. Content is valid UTF-8 with LF line
// endings and no BOM; BOM and LineEnding record what the file had.
type Document struct {
	Content    string `json:"content"`
	Revision   string `json:"revision"`
	BOM        bool   `json:"bom"`
	LineEnding string `json:"line_ending"` // "lf" or "crlf"
}

const maxListed = 5000

func (s *Store) open(root string) (*os.Root, error) {
	dir, ok := s.Dir(root)
	if !ok {
		return nil, errorf("not_found", "Unknown document folder %q.", root)
	}
	return os.OpenRoot(dir)
}

// checkPath accepts only local, slash-separated paths with a supported
// extension.
func checkPath(p string) error {
	if p == "" || strings.Contains(p, `\`) || !filepath.IsLocal(p) || path.Clean(p) != p {
		return errorf("bad_request", "Invalid document path %q.", p)
	}
	if !supported(p) {
		return errorf("bad_request", "Unsupported file type %q; use %s.", p, strings.Join(Extensions, ", "))
	}
	return nil
}

func supported(p string) bool {
	for _, ext := range Extensions {
		if strings.HasSuffix(strings.ToLower(p), ext) && len(p) > len(ext) {
			return true
		}
	}
	return false
}

// List returns the supported documents in a folder and its subfolders.
func (s *Store) List(root string) ([]Entry, error) {
	r, err := s.open(root)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	var out []Entry
	err = fs.WalkDir(r.FS(), ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // unreadable entries are skipped
		}
		if d.IsDir() {
			if p != "." && strings.HasPrefix(d.Name(), ".") {
				return fs.SkipDir
			}
			return nil
		}
		if !d.Type().IsRegular() || strings.HasPrefix(d.Name(), ".") || !supported(p) {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		out = append(out, Entry{Path: p, Size: info.Size(), Modified: info.ModTime().UTC()})
		if len(out) >= maxListed {
			return fs.SkipAll
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return out, nil
}

// Open reads a document.
func (s *Store) Open(root, p string) (Document, error) {
	if err := checkPath(p); err != nil {
		return Document{}, err
	}
	r, err := s.open(root)
	if err != nil {
		return Document{}, err
	}
	defer r.Close()
	info, err := r.Stat(p)
	if errors.Is(err, fs.ErrNotExist) {
		return Document{}, errorf("not_found", "%s does not exist.", p)
	}
	if err != nil {
		return Document{}, err
	}
	if !info.Mode().IsRegular() {
		return Document{}, errorf("bad_request", "%s is not a regular file.", p)
	}
	if info.Size() > s.maxBytes {
		return Document{}, errorf("too_large", "%s is %d bytes; the limit is %d.", p, info.Size(), s.maxBytes)
	}
	data, err := r.ReadFile(p)
	if err != nil {
		return Document{}, err
	}
	return decode(data)
}

var bom = []byte{0xEF, 0xBB, 0xBF}

// decode validates UTF-8 and normalises BOM and line endings (§9.4).
// Invalid UTF-8 is rejected, never replaced.
func decode(data []byte) (Document, error) {
	doc := Document{Revision: Revision(data), LineEnding: "lf"}
	if !utf8.Valid(data) {
		return Document{}, errorf("invalid_utf8", "The file is not valid UTF-8 (first bad byte at offset %d).", firstInvalid(data))
	}
	if bytes.HasPrefix(data, bom) {
		doc.BOM = true
		data = data[len(bom):]
	}
	text := string(data)
	crlf := strings.Count(text, "\r\n")
	if lf := strings.Count(text, "\n"); crlf > 0 && crlf*2 >= lf {
		doc.LineEnding = "crlf"
	}
	doc.Content = strings.ReplaceAll(text, "\r\n", "\n")
	return doc, nil
}

func firstInvalid(data []byte) int {
	for i := 0; i < len(data); {
		r, n := utf8.DecodeRune(data[i:])
		if r == utf8.RuneError && n <= 1 {
			return i
		}
		i += n
	}
	return -1
}

// encode is the inverse of decode.
func encode(content string, withBOM bool, lineEnding string) []byte {
	if lineEnding == "crlf" {
		content = strings.ReplaceAll(content, "\n", "\r\n")
	}
	if withBOM {
		return append(append([]byte{}, bom...), content...)
	}
	return []byte(content)
}

// Revision identifies file content (§9.4).
func Revision(data []byte) string {
	sum := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(sum[:])
}

// Save writes a document if the file on disk still has baseRevision
// (empty for a new file). The write is atomic and the previous version
// is backed up first. It returns the new revision.
func (s *Store) Save(root, p, baseRevision, content string, withBOM bool, lineEnding string) (string, error) {
	if err := checkPath(p); err != nil {
		return "", err
	}
	if lineEnding != "lf" && lineEnding != "crlf" {
		return "", errorf("bad_request", "line_ending must be \"lf\" or \"crlf\".")
	}
	if strings.Contains(content, "\r") {
		return "", errorf("bad_request", "Content must use LF line endings.")
	}
	if !utf8.ValidString(content) {
		return "", errorf("invalid_utf8", "The content is not valid UTF-8.")
	}
	data := encode(content, withBOM, lineEnding)
	if int64(len(data)) > s.maxBytes {
		return "", errorf("too_large", "The document is %d bytes; the limit is %d.", len(data), s.maxBytes)
	}
	return s.write(root, p, baseRevision, data)
}

// Export writes a generated PDF (spec §10.1b) with the same revision
// check, backups and atomic replace as Save. PDFs are not listed or
// opened.
func (s *Store) Export(root, p, baseRevision string, data []byte) (string, error) {
	if err := s.CheckExport(root, p, baseRevision); err != nil {
		return "", err
	}
	return s.write(root, p, baseRevision, data)
}

// CheckExport reports the error Export would give for the path and
// revision, so a caller can check before making the PDF.
func (s *Store) CheckExport(root, p, baseRevision string) error {
	if p == "" || strings.Contains(p, `\`) || !filepath.IsLocal(p) || path.Clean(p) != p ||
		!strings.HasSuffix(strings.ToLower(p), ".pdf") || len(p) == len(".pdf") {
		return errorf("bad_request", "Invalid PDF path %q.", p)
	}
	r, err := s.open(root)
	if err != nil {
		return err
	}
	defer r.Close()
	current := ""
	if old, err := r.ReadFile(p); err == nil {
		current = Revision(old)
	} else if !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	if current != baseRevision {
		return conflict(current, baseRevision)
	}
	return nil
}

// conflict is the error for a file whose revision is current, not
// baseRevision ("" meaning no file).
func conflict(current, baseRevision string) *Error {
	e := errorf("conflict", "The file changed on disk since it was opened.")
	if current == "" {
		e.Message = "The file was deleted on disk since it was opened."
	} else if baseRevision == "" {
		e.Message = "A file with this name already exists."
	}
	e.CurrentRevision = current
	return e
}

// write stores data at p if the file on disk still has baseRevision
// ("" for a new file).
func (s *Store) write(root, p, baseRevision string, data []byte) (string, error) {
	r, err := s.open(root)
	if err != nil {
		return "", err
	}
	defer r.Close()

	old, err := r.ReadFile(p)
	exists := err == nil
	if err != nil && !errors.Is(err, fs.ErrNotExist) {
		return "", err
	}
	current := ""
	if exists {
		current = Revision(old)
	}
	if current != baseRevision {
		return "", conflict(current, baseRevision)
	}
	if exists && current == Revision(data) {
		return current, nil // unchanged
	}
	if exists && s.backupCount > 0 {
		if err := s.backup(root, p, old); err != nil {
			return "", fmt.Errorf("backup: %w", err)
		}
	}
	if dir := path.Dir(p); dir != "." {
		if err := r.MkdirAll(dir, 0o755); err != nil {
			return "", err
		}
	}
	if err := writeAtomic(r, p, data); err != nil {
		return "", err
	}
	return Revision(data), nil
}

// writeAtomic writes a temporary file next to p, syncs it and renames it
// over p.
func writeAtomic(r *os.Root, p string, data []byte) error {
	tmp := path.Join(path.Dir(p), "."+path.Base(p)+".tmp-"+randomSuffix())
	f, err := r.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	_, err = f.Write(data)
	if err == nil {
		err = f.Sync()
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		err = r.Rename(tmp, p)
	}
	if err != nil {
		_ = r.Remove(tmp)
	}
	return err
}

// backup copies the previous version to <backups>/<root>/<path>.<time>
// and keeps the newest backupCount copies.
func (s *Store) backup(root, p string, data []byte) error {
	if err := os.MkdirAll(s.backupsDir, 0o700); err != nil {
		return err
	}
	b, err := os.OpenRoot(s.backupsDir)
	if err != nil {
		return err
	}
	defer b.Close()
	dir := path.Join(root, path.Dir(p))
	if strings.ContainsAny(root, `/\`) || !filepath.IsLocal(dir) {
		return fmt.Errorf("unsafe folder name %q", root)
	}
	if err := b.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	name := path.Base(p)
	stamp := s.now().UTC().Format("20060102T150405.000000000Z")
	if err := writeAtomic(b, path.Join(dir, name+"."+stamp), data); err != nil {
		return err
	}
	entries, err := fs.ReadDir(b.FS(), dir)
	if err != nil {
		return err
	}
	var copies []string
	for _, e := range entries {
		// Only "<name>.<timestamp>", not backups of "<name>.<more>".
		rest, ok := strings.CutPrefix(e.Name(), name+".")
		if ok && len(rest) == len(stamp) && rest[8] == 'T' && strings.HasSuffix(rest, "Z") {
			copies = append(copies, e.Name())
		}
	}
	sort.Strings(copies) // timestamps sort chronologically
	for len(copies) > s.backupCount {
		_ = b.Remove(path.Join(dir, copies[0]))
		copies = copies[1:]
	}
	return nil
}

func randomSuffix() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
