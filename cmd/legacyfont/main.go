// SPDX-License-Identifier: GPL-3.0-or-later

// Command legacyfont shows the text of a PDF typeset with legacy
// (non-Unicode) fonts as raw character codes per font, the input for
// building font-to-Unicode mapping tables, and converts it with the
// tables built so far (docs/legacy-fonts.md).
//
//	legacyfont fonts file.pdf
//	legacyfont dump [-pages 22] file.pdf
//	legacyfont codes [-pages 1-50] [-font SHREE-SAN-0964] file.pdf
//	legacyfont convert [-pages 22] file.pdf
package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/ramprasadp/paramaakshara/internal/legacyfont"
	"github.com/ramprasadp/paramaakshara/internal/pdfread"
)

const usage = `usage: legacyfont <command> [flags] file.pdf

commands:
  fonts   list the fonts used, with glyph counts
  dump    print each line as runs of (font, characters, hex codes)
  codes   list every code used per font: width, count and first word
  convert print each line as Unicode, using the built-in font tables;
          unmapped codes show as ‹XX› and are summed up on stderr
  find    list the words containing -code (hex, e.g. D0) in -font, with
          page, line, position (points from the bottom left) and hex

flags:
  -pages  pages to read, e.g. 22, 20-25 or 1,3,7-9 (default all)
  -font   only this font (codes, find); a prefix is enough
  -code   the code to find, in hex (find)
`

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "legacyfont:", err)
		os.Exit(1)
	}
}

func run(args []string, w io.Writer) error {
	if len(args) == 0 {
		return fmt.Errorf("no command\n%s", usage)
	}
	cmd := args[0]
	fs := flag.NewFlagSet(cmd, flag.ContinueOnError)
	pagesFlag := fs.String("pages", "", "")
	fontFlag := fs.String("font", "", "")
	codeFlag := fs.String("code", "", "")
	fs.Usage = func() { fmt.Fprint(os.Stderr, usage) }
	if err := fs.Parse(args[1:]); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		return fmt.Errorf("need one PDF file\n%s", usage)
	}
	data, err := os.ReadFile(fs.Arg(0))
	if err != nil {
		return err
	}
	f, err := pdfread.Open(data)
	if err != nil {
		return err
	}
	all, err := f.Pages()
	if err != nil {
		return err
	}
	want, err := parsePages(*pagesFlag, len(all))
	if err != nil {
		return err
	}
	var pages []page
	for _, p := range all {
		if want != nil && !want[p.Number] {
			continue
		}
		g, err := f.Glyphs(p)
		if err != nil {
			return fmt.Errorf("page %d: %w", p.Number, err)
		}
		pages = append(pages, page{p.Number, pdfread.Lines(g)})
	}
	switch cmd {
	case "fonts":
		fonts(w, pages)
	case "dump":
		dump(w, pages)
	case "codes":
		codes(w, pages, *fontFlag)
	case "find":
		c, err := strconv.ParseUint(*codeFlag, 16, 8)
		if err != nil {
			return fmt.Errorf("-code: want a hex byte such as D0, got %q", *codeFlag)
		}
		tables, err := legacyfont.Tables()
		if err != nil {
			return err
		}
		find(w, pages, *fontFlag, byte(c), tables)
	case "convert":
		tables, err := legacyfont.Tables()
		if err != nil {
			return err
		}
		convert(w, os.Stderr, pages, tables)
	default:
		return fmt.Errorf("unknown command %q\n%s", cmd, usage)
	}
	return nil
}

type page struct {
	number int
	lines  []pdfread.Line
}

// parsePages reads "22", "20-25" or "1,3,7-9". Empty means all (nil).
func parsePages(s string, n int) (map[int]bool, error) {
	if s == "" {
		return nil, nil
	}
	m := map[int]bool{}
	for _, part := range strings.Split(s, ",") {
		lo, hi, isRange := strings.Cut(strings.TrimSpace(part), "-")
		a, err := strconv.Atoi(lo)
		b := a
		if err == nil && isRange {
			b, err = strconv.Atoi(hi)
		}
		if err != nil || a < 1 || b < a || b > n {
			return nil, fmt.Errorf("bad page range %q (the PDF has %d pages)", part, n)
		}
		for i := a; i <= b; i++ {
			m[i] = true
		}
	}
	return m, nil
}

func fonts(w io.Writer, pages []page) {
	count := map[string]int{}
	for _, p := range pages {
		for _, l := range p.lines {
			for _, r := range l.Runs {
				if r.Font != nil {
					count[label(r.Font)] += len(r.Code)
				}
			}
		}
	}
	names := make([]string, 0, len(count))
	for n := range count {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, n := range names {
		fmt.Fprintf(w, "%-28s %8d bytes\n", n, count[n])
	}
}

func label(f *pdfread.Font) string {
	if f.TwoByte {
		return f.Name + " (2-byte)"
	}
	return f.Name
}

// dump prints each run as the font name and its codes read as
// Windows-1252 (what the PDF declares for these fonts and what a copy
// from a PDF viewer typically yields), with the hex codes below.
func dump(w io.Writer, pages []page) {
	for _, p := range pages {
		fmt.Fprintf(w, "== page %d ==\n", p.number)
		for i, l := range p.lines {
			fmt.Fprintf(w, "line %d  y=%.1f\n", i+1, l.Y)
			for _, r := range l.Runs {
				if r.Font == nil {
					fmt.Fprintf(w, "  %-20s\n", "(gap)")
					continue
				}
				fmt.Fprintf(w, "  %-20s %s\n  %-20s %s\n", r.Font.Name, cp1252(r.Code), "", hex(r.Code))
			}
		}
	}
}

// convert writes each line as Unicode (legacyfont.ConvertLine) and sums
// up fonts without a table and unmapped codes on warn.
func convert(w, warn io.Writer, pages []page, tables map[string]*legacyfont.Table) {
	unmapped := map[string]map[byte]int{}
	untabled := map[string]bool{}
	for _, p := range pages {
		fmt.Fprintf(w, "== page %d ==\n", p.number)
		for _, l := range p.lines {
			for _, r := range l.Runs {
				if r.Font != nil && tables[r.Font.Name] == nil {
					untabled[r.Font.Name] = true
				}
			}
			fmt.Fprintln(w, legacyfont.ConvertLine(l, tables, func(font string, c byte) {
				if unmapped[font] == nil {
					unmapped[font] = map[byte]int{}
				}
				unmapped[font][c]++
			}))
		}
	}
	for _, name := range sortedKeys(untabled) {
		fmt.Fprintf(warn, "no table for %s: shown as Windows-1252\n", name)
	}
	for _, name := range sortedKeys(unmapped) {
		var parts []string
		for c := 0; c < 256; c++ {
			if n := unmapped[name][byte(c)]; n > 0 {
				parts = append(parts, fmt.Sprintf("%02X×%d", c, n))
			}
		}
		fmt.Fprintf(warn, "%s unmapped: %s\n", name, strings.Join(parts, " "))
	}
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// find prints each word that contains code in a font whose name starts
// with only, and its conversion when the font has a table. A word is a
// run of glyphs between spaces or gaps.
func find(w io.Writer, pages []page, only string, code byte, tables map[string]*legacyfont.Table) {
	for _, p := range pages {
		for i, l := range p.lines {
			var word []pdfread.Glyph
			flush := func() {
				for _, g := range word {
					if len(g.Code) == 1 && g.Code[0] == code {
						printWord(w, p.number, i+1, word, tables[word[0].Font.Name])
						break
					}
				}
				word = word[:0]
			}
			for _, r := range l.Runs {
				if r.Font == nil || !strings.HasPrefix(r.Font.Name, only) {
					flush()
					continue
				}
				for _, g := range r.Glyphs {
					if len(g.Code) == 1 && g.Code[0] == ' ' {
						flush()
					} else {
						word = append(word, g)
					}
				}
			}
			flush()
		}
	}
}

func printWord(w io.Writer, page, line int, word []pdfread.Glyph, t *legacyfont.Table) {
	x0, x1 := word[0].X0, word[0].X1
	var b []byte
	for _, g := range word {
		x0, x1 = min(x0, g.X0), max(x1, g.X1)
		b = append(b, g.Code...)
	}
	g := word[0]
	fmt.Fprintf(w, "p%d l%d x=%.1f-%.1f y=%.1f size=%.1f  %s", page, line, x0, x1, g.Y, g.Size, hex(b))
	if t != nil {
		text, _ := t.Convert(b)
		fmt.Fprintf(w, "  %s", text)
	}
	fmt.Fprintln(w)
}

type codeUse struct {
	width   float64
	count   int
	example string // first use: page, line and the word it is in
}

func codes(w io.Writer, pages []page, only string) {
	uses := map[string]map[string]*codeUse{}
	for _, p := range pages {
		for i, l := range p.lines {
			for _, r := range l.Runs {
				if r.Font == nil || !strings.HasPrefix(r.Font.Name, only) {
					continue
				}
				step := 1
				if r.Font.TwoByte {
					step = 2
				}
				byCode := uses[label(r.Font)]
				if byCode == nil {
					byCode = map[string]*codeUse{}
					uses[label(r.Font)] = byCode
				}
				for k := 0; k+step <= len(r.Code); k += step {
					c := string(r.Code[k : k+step])
					u := byCode[c]
					if u == nil {
						u = &codeUse{width: r.Font.Width(code(r.Code[k : k+step])), example: fmt.Sprintf("p%d l%d  %s", p.number, i+1, hex(word(r.Code, k)))}
						byCode[c] = u
					}
					u.count++
				}
			}
		}
	}
	names := make([]string, 0, len(uses))
	for n := range uses {
		names = append(names, n)
	}
	sort.Strings(names)
	for _, n := range names {
		fmt.Fprintf(w, "== %s ==\n", n)
		cs := make([]string, 0, len(uses[n]))
		for c := range uses[n] {
			cs = append(cs, c)
		}
		sort.Strings(cs)
		for _, c := range cs {
			u := uses[n][c]
			fmt.Fprintf(w, "  %-5s %-8s w%-4.0f %7d  %s\n", hex([]byte(c)), cp1252([]byte(c)), u.width, u.count, u.example)
		}
	}
}

func code(b []byte) int {
	n := 0
	for _, c := range b {
		n = n<<8 | int(c)
	}
	return n
}

// word returns the space-delimited word of b around index i, or the
// space itself.
func word(b []byte, i int) []byte {
	if b[i] == ' ' {
		return b[i : i+1]
	}
	start, end := i, i
	for start > 0 && b[start-1] != ' ' {
		start--
	}
	for end < len(b) && b[end] != ' ' {
		end++
	}
	return b[start:end]
}

func hex(b []byte) string {
	var sb strings.Builder
	for i, c := range b {
		if i > 0 {
			sb.WriteByte(' ')
		}
		fmt.Fprintf(&sb, "%02X", c)
	}
	return sb.String()
}

// win1252 holds 0x80–0x9F; the rest of the code page matches Latin-1.
// Undefined positions are 0. Control characters and undefined codes are
// shown as \xNN so that the output stays one line per run.
var win1252 = [32]rune{
	0x20AC, 0, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
	0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017D, 0,
	0, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
	0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0, 0x017E, 0x0178,
}

func cp1252(b []byte) string {
	var sb strings.Builder
	for _, c := range b {
		r := rune(c)
		if c >= 0x80 && c <= 0x9F {
			r = win1252[c-0x80]
		}
		if r == 0 || c < 0x20 || c == 0x7F {
			fmt.Fprintf(&sb, "\\x%02X", c)
		} else {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}
