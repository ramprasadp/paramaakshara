// SPDX-License-Identifier: GPL-3.0-or-later

// Package pdfread reads the text drawing operations of a PDF: which bytes
// are shown in which font, and where. It exists to study PDFs typeset with
// legacy (non-Unicode) Indic fonts, whose text cannot be copied as Unicode
// (docs/legacy-fonts.md). It is not a general PDF library: no encryption,
// no repair, and only the Flate filter.
package pdfread

import (
	"bytes"
	"compress/zlib"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
)

// File is a parsed PDF.
type File struct {
	objs map[int]any
	root Dict
}

var objHeader = regexp.MustCompile(`(\d+)[ \t\r\n\f\x00]+(\d+)[ \t\r\n\f\x00]+obj\b`)

// Open parses a PDF. Objects are found by scanning for "n g obj" rather
// than through the cross-reference table, so damaged tables do not
// matter; a later definition of an object replaces an earlier one, as
// with incremental updates.
func Open(data []byte) (*File, error) {
	if !bytes.HasPrefix(bytes.TrimLeft(data, " \t\r\n"), []byte("%PDF-")) {
		return nil, errors.New("pdfread: not a PDF file")
	}
	if bytes.Contains(data, []byte("/Encrypt")) {
		return nil, errors.New("pdfread: encrypted PDFs are not supported")
	}
	f := &File{objs: map[int]any{}}
	pos := 0
	for {
		loc := objHeader.FindSubmatchIndex(data[pos:])
		if loc == nil {
			break
		}
		var num int
		fmt.Sscan(string(data[pos+loc[2]:pos+loc[3]]), &num)
		l := &lexer{b: data, pos: pos + loc[1]}
		obj, err := l.object()
		if err != nil {
			pos += loc[1]
			continue
		}
		if d, ok := obj.(Dict); ok {
			if s, end, ok := streamAfter(data, l.pos, d); ok {
				obj = s
				l.pos = end
			}
		}
		f.objs[num] = obj
		pos = l.pos
	}
	if len(f.objs) == 0 {
		return nil, errors.New("pdfread: no objects found")
	}
	f.loadObjectStreams()
	if err := f.findRoot(data); err != nil {
		return nil, err
	}
	return f, nil
}

// streamAfter reads stream data following a dictionary at pos.
func streamAfter(data []byte, pos int, d Dict) (*Stream, int, bool) {
	l := &lexer{b: data, pos: pos}
	l.skipSpace()
	if !bytes.HasPrefix(data[l.pos:], []byte("stream")) {
		return nil, 0, false
	}
	start := l.pos + len("stream")
	if bytes.HasPrefix(data[start:], []byte("\r\n")) {
		start += 2
	} else if start < len(data) && (data[start] == '\n' || data[start] == '\r') {
		start++
	}
	// Use /Length when it is direct and points at "endstream".
	if n, ok := d["Length"].(int); ok && n >= 0 && start+n <= len(data) {
		rest := bytes.TrimLeft(data[start+n:], "\r\n \t")
		if bytes.HasPrefix(rest, []byte("endstream")) {
			end := len(data) - len(rest) + len("endstream")
			return &Stream{Dict: d, Raw: data[start : start+n]}, end, true
		}
	}
	i := bytes.Index(data[start:], []byte("endstream"))
	if i < 0 {
		return nil, 0, false
	}
	raw := data[start : start+i]
	raw = bytes.TrimSuffix(raw, []byte("\n"))
	raw = bytes.TrimSuffix(raw, []byte("\r"))
	return &Stream{Dict: d, Raw: raw}, start + i + len("endstream"), true
}

// loadObjectStreams adds objects stored in object streams (PDF 1.5+)
// that were not defined directly.
func (f *File) loadObjectStreams() {
	for _, o := range f.objs {
		s, ok := o.(*Stream)
		if !ok || s.Dict["Type"] != Name("ObjStm") {
			continue
		}
		data, err := f.Decode(s)
		if err != nil {
			continue
		}
		n, _ := f.Resolve(s.Dict["N"]).(int)
		first, _ := f.Resolve(s.Dict["First"]).(int)
		if first > len(data) {
			continue
		}
		hl := &lexer{b: data[:first]}
		for i := 0; i < n; i++ {
			num, err1 := hl.object()
			off, err2 := hl.object()
			on, ok1 := num.(int)
			oo, ok2 := off.(int)
			if err1 != nil || err2 != nil || !ok1 || !ok2 {
				break
			}
			if _, exists := f.objs[on]; exists || first+oo >= len(data) {
				continue
			}
			if obj, err := (&lexer{b: data, pos: first + oo}).object(); err == nil {
				f.objs[on] = obj
			}
		}
	}
}

func (f *File) findRoot(data []byte) error {
	if i := bytes.LastIndex(data, []byte("trailer")); i >= 0 {
		l := &lexer{b: data, pos: i + len("trailer")}
		if t, err := l.object(); err == nil {
			if td, ok := t.(Dict); ok {
				if r, ok := f.Resolve(td["Root"]).(Dict); ok {
					f.root = r
					return nil
				}
			}
		}
	}
	// Cross-reference streams carry the trailer keys; or just find the
	// catalog.
	for _, o := range f.objs {
		if d := dictOf(o); d != nil && d["Type"] == Name("Catalog") {
			f.root = d
			return nil
		}
	}
	return errors.New("pdfread: no document catalog")
}

func dictOf(o any) Dict {
	switch v := o.(type) {
	case Dict:
		return v
	case *Stream:
		return v.Dict
	}
	return nil
}

// Resolve follows indirect references.
func (f *File) Resolve(o any) any {
	for i := 0; i < 32; i++ {
		r, ok := o.(Ref)
		if !ok {
			return o
		}
		o = f.objs[r.Num]
	}
	return nil
}

func (f *File) dict(o any) Dict { return dictOf(f.Resolve(o)) }

// Decode returns a stream's decoded data.
func (f *File) Decode(s *Stream) ([]byte, error) {
	var filters []any
	switch v := f.Resolve(s.Dict["Filter"]).(type) {
	case nil:
	case Name:
		filters = []any{v}
	case Array:
		filters = v
	}
	data := s.Raw
	for _, fl := range filters {
		switch n, _ := f.Resolve(fl).(Name); n {
		case "FlateDecode", "Fl":
			if p := f.dict(s.Dict["DecodeParms"]); p != nil {
				if pr, _ := f.Resolve(p["Predictor"]).(int); pr > 1 {
					return nil, fmt.Errorf("pdfread: predictor %d is not supported", pr)
				}
			}
			r, err := zlib.NewReader(bytes.NewReader(data))
			if err != nil {
				return nil, err
			}
			out, err := io.ReadAll(r)
			// Many writers leave a bad checksum or truncated tail; keep
			// what was decoded.
			if err != nil && len(out) == 0 {
				return nil, err
			}
			data = out
		default:
			return nil, fmt.Errorf("pdfread: filter %s is not supported", n)
		}
	}
	return data, nil
}

// Page is one page with its inherited resources.
type Page struct {
	Number    int // 1-based
	dict      Dict
	resources Dict
}

// Pages returns the pages in order.
func (f *File) Pages() ([]Page, error) {
	var pages []Page
	var walk func(node Dict, res Dict, depth int) error
	walk = func(node Dict, res Dict, depth int) error {
		if depth > 64 {
			return errors.New("pdfread: page tree too deep")
		}
		if r := f.dict(node["Resources"]); r != nil {
			res = r
		}
		if node["Type"] == Name("Page") || node["Kids"] == nil {
			pages = append(pages, Page{Number: len(pages) + 1, dict: node, resources: res})
			return nil
		}
		kids, _ := f.Resolve(node["Kids"]).(Array)
		for _, k := range kids {
			if kd := f.dict(k); kd != nil {
				if err := walk(kd, res, depth+1); err != nil {
					return err
				}
			}
		}
		return nil
	}
	root := f.dict(f.root["Pages"])
	if root == nil {
		return nil, errors.New("pdfread: no page tree")
	}
	if err := walk(root, nil, 0); err != nil {
		return nil, err
	}
	return pages, nil
}

// contents returns a page's content streams, decoded and joined.
func (f *File) contents(p Page) ([]byte, error) {
	var parts []any
	switch v := f.Resolve(p.dict["Contents"]).(type) {
	case *Stream:
		parts = []any{v}
	case Array:
		parts = v
	}
	var out []byte
	for _, part := range parts {
		s, ok := f.Resolve(part).(*Stream)
		if !ok {
			continue
		}
		d, err := f.Decode(s)
		if err != nil {
			return nil, err
		}
		out = append(append(out, d...), '\n')
	}
	return out, nil
}

// Font is what the text reader needs to know about a font.
type Font struct {
	Name      string // BaseFont without a subset prefix such as "ABCDEF+"
	Subtype   string
	TwoByte   bool // Type0 font: two-byte codes are assumed
	firstChar int
	widths    []float64
}

// Width is a code's advance width in thousandths of the font size, from
// the font's /Widths (500 when missing).
func (ft *Font) Width(code int) float64 {
	if i := code - ft.firstChar; ft.widths != nil && i >= 0 && i < len(ft.widths) {
		return ft.widths[i]
	}
	return 500
}

func (f *File) font(o any) *Font {
	d := f.dict(o)
	if d == nil {
		return &Font{Name: "?"}
	}
	base, _ := f.Resolve(d["BaseFont"]).(Name)
	name := string(base)
	if i := strings.IndexByte(name, '+'); i == 6 {
		name = name[7:]
	}
	sub, _ := f.Resolve(d["Subtype"]).(Name)
	ft := &Font{Name: name, Subtype: string(sub), TwoByte: sub == "Type0"}
	ft.firstChar, _ = f.Resolve(d["FirstChar"]).(int)
	if ws, ok := f.Resolve(d["Widths"]).(Array); ok {
		for _, w := range ws {
			ft.widths = append(ft.widths, num(f.Resolve(w)))
		}
	}
	return ft
}

func num(o any) float64 {
	switch v := o.(type) {
	case int:
		return float64(v)
	case float64:
		return v
	}
	return 0
}
