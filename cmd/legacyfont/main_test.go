// SPDX-License-Identifier: GPL-3.0-or-later

package main

import (
	"reflect"
	"strings"
	"testing"

	"github.com/ramprasadp/paramaakshara/internal/legacyfont"
	"github.com/ramprasadp/paramaakshara/internal/pdfread"
)

func TestParsePages(t *testing.T) {
	got, err := parsePages("1,3, 7-9", 10)
	if err != nil {
		t.Fatal(err)
	}
	want := map[int]bool{1: true, 3: true, 7: true, 8: true, 9: true}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
	if all, err := parsePages("", 10); all != nil || err != nil {
		t.Errorf("empty: got %v, %v", all, err)
	}
	for _, bad := range []string{"0", "11", "5-3", "x", "2-"} {
		if _, err := parsePages(bad, 10); err == nil {
			t.Errorf("%q accepted", bad)
		}
	}
}

func TestCP1252(t *testing.T) {
	got := cp1252([]byte{'T', '"', 0x85, 0x81, 0xED, 0x09})
	if want := `T"…\x81í\x09`; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestWord(t *testing.T) {
	b := []byte("ab cd ef")
	if got := string(word(b, 4)); got != "cd" {
		t.Errorf("got %q, want cd", got)
	}
	if got := string(word(b, 2)); got != " " {
		t.Errorf("space: got %q", got)
	}
}

func TestConvertJoinsGapsAndPassesLatin(t *testing.T) {
	tables, err := legacyfont.Tables()
	if err != nil {
		t.Fatal(err)
	}
	shree := &pdfread.Font{Name: "SHREE-SAN-0962"}
	arial := &pdfread.Font{Name: "Arial"}
	pages := []page{{22, []pdfread.Line{{Runs: []pdfread.Run{
		{Font: arial, Code: []byte("22")},
		{},
		// The anudatta after the gap belongs to मं (as on page 22).
		{Font: shree, Code: []byte{0x58, 0x22, 0x7A}},
		{},
		{Font: shree, Code: []byte{0x85, 0x53, 0x22, 0x01}},
	}}}}}
	var out, warn strings.Builder
	convert(&out, &warn, pages, tables)
	if want := "== page 22 ==\n22 मं॒ न‹01›\n"; out.String() != want {
		t.Errorf("got %q, want %q", out.String(), want)
	}
	if want := "no table for Arial: shown as Windows-1252\nSHREE-SAN-0962 unmapped: 01×1\n"; warn.String() != want {
		t.Errorf("warnings %q, want %q", warn.String(), want)
	}
}
