// SPDX-License-Identifier: GPL-3.0-or-later

package legacyfont

import (
	"fmt"
	"sort"
	"strings"

	"github.com/ramprasadp/paramaakshara/internal/pdfread"
)

// Document is the text of a PDF, converted with the tables (TECH_SPEC
// §6.10).
type Document struct {
	Pages    []Page     `json:"pages"`
	Fonts    []FontUse  `json:"fonts"`
	Unmapped []Unmapped `json:"unmapped"`
}

// Page holds one page's lines in the order the PDF draws them.
type Page struct {
	Number int      `json:"number"`
	Lines  []string `json:"lines"`
}

// FontUse is a font used for text and the table that converted it; Table
// is empty when there is none and the text was read as Windows-1252.
type FontUse struct {
	Name  string `json:"name"`
	Table string `json:"table"`
	Bytes int    `json:"bytes"`
}

// Unmapped is a code a table has no entry for, kept in the text as ‹XX›.
type Unmapped struct {
	Font  string `json:"font"`
	Code  string `json:"code"` // hex, e.g. "22"
	Count int    `json:"count"`
}

// ConvertPDF converts every page of a PDF.
func ConvertPDF(data []byte, tables map[string]*Table) (*Document, error) {
	f, err := pdfread.Open(data)
	if err != nil {
		return nil, err
	}
	pages, err := f.Pages()
	if err != nil {
		return nil, err
	}
	doc := &Document{Pages: []Page{}, Fonts: []FontUse{}, Unmapped: []Unmapped{}}
	fonts := map[string]*FontUse{}
	missing := map[[2]string]int{}
	for _, p := range pages {
		glyphs, err := f.Glyphs(p)
		if err != nil {
			return nil, fmt.Errorf("page %d: %w", p.Number, err)
		}
		page := Page{Number: p.Number, Lines: []string{}}
		for _, l := range pdfread.Lines(glyphs) {
			for _, r := range l.Runs {
				if r.Font == nil {
					continue
				}
				u := fonts[r.Font.Name]
				if u == nil {
					u = &FontUse{Name: r.Font.Name}
					if t := tables[r.Font.Name]; t != nil {
						u.Table = t.Font
					}
					fonts[r.Font.Name] = u
				}
				u.Bytes += len(r.Code)
			}
			page.Lines = append(page.Lines, ConvertLine(l, tables, func(font string, code byte) {
				missing[[2]string{font, fmt.Sprintf("%02X", code)}]++
			}))
		}
		doc.Pages = append(doc.Pages, page)
	}
	for _, u := range fonts {
		doc.Fonts = append(doc.Fonts, *u)
	}
	sort.Slice(doc.Fonts, func(i, j int) bool { return doc.Fonts[i].Bytes > doc.Fonts[j].Bytes })
	for k, n := range missing {
		doc.Unmapped = append(doc.Unmapped, Unmapped{Font: k[0], Code: k[1], Count: n})
	}
	sort.Slice(doc.Unmapped, func(i, j int) bool {
		a, b := doc.Unmapped[i], doc.Unmapped[j]
		if a.Font != b.Font {
			return a.Font < b.Font
		}
		return a.Code < b.Code
	})
	return doc, nil
}

// ConvertLine converts one line. Runs of one table separated only by gaps
// are converted together, the gap as a space, so that reordering sees
// whole words. Fonts without a table are read as Windows-1252, which is
// right for ordinary Latin fonts. Each code a table has no entry for is
// passed to unmapped with the font's name.
func ConvertLine(l pdfread.Line, tables map[string]*Table, unmapped func(font string, code byte)) string {
	var sb strings.Builder
	var buf []byte
	var cur *Table
	var curFont string
	flush := func() {
		if cur != nil && len(buf) > 0 {
			text, miss := cur.Convert(buf)
			sb.WriteString(text)
			for _, c := range miss {
				unmapped(curFont, c)
			}
		}
		buf = buf[:0]
	}
	for _, r := range l.Runs {
		if r.Font == nil {
			if cur != nil {
				buf = append(buf, ' ')
			} else {
				sb.WriteByte(' ')
			}
			continue
		}
		t := tables[r.Font.Name]
		if t != cur {
			flush()
			cur, curFont = t, r.Font.Name
		}
		if t == nil {
			sb.WriteString(Windows1252(r.Code))
		} else {
			buf = append(buf, r.Code...)
		}
	}
	flush()
	return strings.TrimRight(sb.String(), " ")
}

// win1252 holds 0x80–0x9F; the rest of the code page above 0x9F matches
// Latin-1. Undefined positions are 0.
var win1252 = [32]rune{
	0x20AC, 0, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
	0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017D, 0,
	0, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
	0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0, 0x017E, 0x0178,
}

// Windows1252 decodes Windows-1252 text. Control characters and undefined
// codes are kept visible as ‹XX›.
func Windows1252(b []byte) string {
	var sb strings.Builder
	for _, c := range b {
		r := rune(c)
		if c >= 0x80 && c <= 0x9F {
			r = win1252[c-0x80]
		}
		if r == 0 || c < 0x20 || c == 0x7F {
			fmt.Fprintf(&sb, "\u2039%02X\u203A", c)
		} else {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}
