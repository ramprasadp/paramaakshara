// SPDX-License-Identifier: GPL-3.0-or-later

package logging

import (
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

func TestWritesPlainLinesToFile(t *testing.T) {
	file := filepath.Join(t.TempDir(), "logs", "p.log")
	c, err := Setup(file, 3)
	if err != nil {
		t.Fatal(err)
	}
	log.Printf("GET /api/health 200 %s", "12µs")
	if err := c.Close(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	line := strings.TrimSpace(string(data))
	if !regexp.MustCompile(`^\d{4}/\d\d/\d\d \d\d:\d\d:\d\d GET /api/health 200 12µs$`).MatchString(line) {
		t.Fatalf("line = %q", line)
	}
}

func TestRotatesFileFromEarlierDay(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "p.log")
	if err := os.WriteFile(file, []byte("old\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	yesterday := time.Now().Add(-26 * time.Hour)
	if err := os.Chtimes(file, yesterday, yesterday); err != nil {
		t.Fatal(err)
	}
	c, err := Setup(file, 3)
	if err != nil {
		t.Fatal(err)
	}
	log.Print("new")
	c.Close()
	entries, _ := os.ReadDir(dir)
	if len(entries) != 2 {
		t.Fatalf("files = %d, want the current log and one rotated backup", len(entries))
	}
	data, _ := os.ReadFile(file)
	if strings.Contains(string(data), "old") {
		t.Fatal("old lines are still in the current log")
	}
}

func TestKeepsTodaysFile(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "p.log")
	if err := os.WriteFile(file, []byte("earlier today\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	c, err := Setup(file, 3)
	if err != nil {
		t.Fatal(err)
	}
	log.Print("later")
	c.Close()
	data, _ := os.ReadFile(file)
	if !strings.Contains(string(data), "earlier today") || !strings.Contains(string(data), "later") {
		t.Fatalf("log = %q; want both lines appended", data)
	}
}

func TestNextMidnight(t *testing.T) {
	loc := time.FixedZone("IST", 5*3600+1800)
	now := time.Date(2026, 12, 31, 23, 59, 0, 0, loc)
	want := time.Date(2027, 1, 1, 0, 0, 0, 0, loc)
	if got := nextMidnight(now); !got.Equal(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
