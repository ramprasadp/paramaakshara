// SPDX-License-Identifier: GPL-3.0-or-later

package pdfread

import (
	"bytes"
	"math"
)

// Glyph is one character code shown on a page, in device space (points,
// origin bottom left).
type Glyph struct {
	Font   *Font
	Code   []byte // one byte, or two for Type0 fonts
	X0, X1 float64
	Y      float64 // baseline, without text rise
	Size   float64 // font size in device space
}

type matrix [6]float64

var identity = matrix{1, 0, 0, 1, 0, 0}

// mul returns m × n (apply m, then n).
func (m matrix) mul(n matrix) matrix {
	return matrix{
		m[0]*n[0] + m[1]*n[2],
		m[0]*n[1] + m[1]*n[3],
		m[2]*n[0] + m[3]*n[2],
		m[2]*n[1] + m[3]*n[3],
		m[4]*n[0] + m[5]*n[2] + n[4],
		m[4]*n[1] + m[5]*n[3] + n[5],
	}
}

func (m matrix) apply(x, y float64) (float64, float64) {
	return x*m[0] + y*m[2] + m[4], x*m[1] + y*m[3] + m[5]
}

func translate(x, y float64) matrix { return matrix{1, 0, 0, 1, x, y} }

type gstate struct {
	ctm                   matrix
	font                  *Font
	size                  float64
	charSp, wordSp, scale float64
	leading               float64
}

type textReader struct {
	f      *File
	glyphs []Glyph
	gs     gstate
	stack  []gstate
	tm     matrix
	tlm    matrix
	depth  int
}

// Glyphs returns the glyphs drawn on a page, in content-stream order.
// Text in form XObjects is included; Type3 glyph procedures are not.
func (f *File) Glyphs(p Page) ([]Glyph, error) {
	data, err := f.contents(p)
	if err != nil {
		return nil, err
	}
	r := &textReader{f: f, gs: gstate{ctm: identity, scale: 1}}
	r.run(data, p.resources)
	return r.glyphs, nil
}

func (r *textReader) run(data []byte, res Dict) {
	fonts := r.f.dict(res["Font"])
	xobjs := r.f.dict(res["XObject"])
	cache := map[Name]*Font{}
	l := &lexer{b: data}
	var ops []any
	for {
		o, err := l.object()
		if err != nil {
			return
		}
		op, ok := o.(Keyword)
		if !ok {
			ops = append(ops, o)
			continue
		}
		switch op {
		case "BI":
			skipInlineImage(l)
		case "q":
			r.stack = append(r.stack, r.gs)
		case "Q":
			if n := len(r.stack); n > 0 {
				r.gs, r.stack = r.stack[n-1], r.stack[:n-1]
			}
		case "cm":
			if m, ok := mat(ops); ok {
				r.gs.ctm = m.mul(r.gs.ctm)
			}
		case "BT":
			r.tm, r.tlm = identity, identity
		case "Tf":
			if len(ops) >= 2 {
				name, _ := ops[len(ops)-2].(Name)
				ft, ok := cache[name]
				if !ok {
					ft = r.f.font(fonts[name])
					cache[name] = ft
				}
				r.gs.font, r.gs.size = ft, num(ops[len(ops)-1])
			}
		case "Tc":
			r.gs.charSp = last(ops)
		case "Tw":
			r.gs.wordSp = last(ops)
		case "Tz":
			r.gs.scale = last(ops) / 100
		case "TL":
			r.gs.leading = last(ops)
		case "Td", "TD":
			if len(ops) >= 2 {
				tx, ty := num(ops[len(ops)-2]), num(ops[len(ops)-1])
				if op == "TD" {
					r.gs.leading = -ty
				}
				r.tlm = translate(tx, ty).mul(r.tlm)
				r.tm = r.tlm
			}
		case "Tm":
			if m, ok := mat(ops); ok {
				r.tm, r.tlm = m, m
			}
		case "T*":
			r.nextLine()
		case "Tj":
			r.showLast(ops)
		case "'":
			r.nextLine()
			r.showLast(ops)
		case "\"":
			if len(ops) >= 3 {
				r.gs.wordSp, r.gs.charSp = num(ops[len(ops)-3]), num(ops[len(ops)-2])
			}
			r.nextLine()
			r.showLast(ops)
		case "TJ":
			if len(ops) > 0 {
				arr, _ := ops[len(ops)-1].(Array)
				for _, e := range arr {
					if s, ok := e.(String); ok {
						r.show(s)
					} else {
						tx := -num(e) / 1000 * r.gs.size * r.gs.scale
						r.tm = translate(tx, 0).mul(r.tm)
					}
				}
			}
		case "Do":
			if len(ops) > 0 && r.depth < 8 {
				name, _ := ops[len(ops)-1].(Name)
				r.form(r.f.Resolve(xobjs[name]), res)
			}
		}
		ops = ops[:0]
	}
}

func (r *textReader) form(o any, parentRes Dict) {
	s, ok := o.(*Stream)
	if !ok || s.Dict["Subtype"] != Name("Form") {
		return
	}
	data, err := r.f.Decode(s)
	if err != nil {
		return
	}
	res := r.f.dict(s.Dict["Resources"])
	if res == nil {
		res = parentRes
	}
	saved, savedTm, savedTlm := r.gs, r.tm, r.tlm
	if m, ok := r.f.Resolve(s.Dict["Matrix"]).(Array); ok && len(m) == 6 {
		var fm matrix
		for i := range fm {
			fm[i] = num(r.f.Resolve(m[i]))
		}
		r.gs.ctm = fm.mul(r.gs.ctm)
	}
	r.depth++
	r.run(data, res)
	r.depth--
	r.gs, r.tm, r.tlm = saved, savedTm, savedTlm
}

func (r *textReader) nextLine() {
	r.tlm = translate(0, -r.gs.leading).mul(r.tlm)
	r.tm = r.tlm
}

func (r *textReader) showLast(ops []any) {
	if len(ops) > 0 {
		if s, ok := ops[len(ops)-1].(String); ok {
			r.show(s)
		}
	}
}

func (r *textReader) show(s String) {
	ft := r.gs.font
	if ft == nil {
		ft = &Font{Name: "?"}
	}
	step := 1
	if ft.TwoByte {
		step = 2
	}
	for i := 0; i+step <= len(s); i += step {
		code := int(s[i])
		if step == 2 {
			code = code<<8 | int(s[i+1])
		}
		tx := ft.Width(code)/1000*r.gs.size + r.gs.charSp
		if step == 1 && code == ' ' {
			tx += r.gs.wordSp
		}
		tx *= r.gs.scale
		m := r.tm.mul(r.gs.ctm)
		x0, y := m.apply(0, 0)
		x1, _ := m.apply(tx, 0)
		r.glyphs = append(r.glyphs, Glyph{
			Font: ft,
			Code: bytes.Clone(s[i : i+step]),
			X0:   x0, X1: x1, Y: y,
			Size: r.gs.size * math.Hypot(m[2], m[3]),
		})
		r.tm = translate(tx, 0).mul(r.tm)
	}
}

func last(ops []any) float64 {
	if len(ops) == 0 {
		return 0
	}
	return num(ops[len(ops)-1])
}

func mat(ops []any) (matrix, bool) {
	if len(ops) < 6 {
		return matrix{}, false
	}
	var m matrix
	for i := range m {
		m[i] = num(ops[len(ops)-6+i])
	}
	return m, true
}

// skipInlineImage moves past an inline image's dictionary and data.
func skipInlineImage(l *lexer) {
	for {
		o, err := l.object()
		if err != nil {
			return
		}
		if k, ok := o.(Keyword); ok && k == "ID" {
			break
		}
	}
	for i := l.pos + 1; i+2 <= len(l.b); i++ {
		if l.b[i] == 'E' && l.b[i+1] == 'I' && isWhite(l.b[i-1]) &&
			(i+2 == len(l.b) || isWhite(l.b[i+2])) {
			l.pos = i + 2
			return
		}
	}
	l.pos = len(l.b)
}

// Run is consecutive glyphs on one line in the same font. A Run with a
// nil Font stands for a visible gap (a word space not drawn as a glyph).
type Run struct {
	Font   *Font
	Code   []byte
	Glyphs []Glyph // the glyphs of Code, with their positions
}

// Line is a sequence of runs sharing a baseline.
type Line struct {
	Y    float64
	Runs []Run
}

// Lines groups glyphs into lines in content-stream order. A glyph starts
// a new line when its baseline is more than half the font size away from
// the current line's; a horizontal gap of more than a quarter of the font
// size becomes a gap run.
func Lines(glyphs []Glyph) []Line {
	var lines []Line
	var prevX1, size float64
	for _, g := range glyphs {
		sz := math.Max(g.Size, 1)
		n := len(lines)
		if n == 0 || math.Abs(g.Y-lines[n-1].Y) > sz/2 {
			lines = append(lines, Line{Y: g.Y})
			n++
		} else if g.X0-prevX1 > math.Max(sz, size)/4 {
			lines[n-1].Runs = append(lines[n-1].Runs, Run{})
		}
		ln := &lines[n-1]
		if k := len(ln.Runs); k > 0 && sameFont(ln.Runs[k-1].Font, g.Font) {
			ln.Runs[k-1].Code = append(ln.Runs[k-1].Code, g.Code...)
			ln.Runs[k-1].Glyphs = append(ln.Runs[k-1].Glyphs, g)
		} else {
			ln.Runs = append(ln.Runs, Run{Font: g.Font, Code: bytes.Clone(g.Code), Glyphs: []Glyph{g}})
		}
		prevX1, size = g.X1, sz
	}
	return lines
}

func sameFont(a, b *Font) bool { return a != nil && b != nil && a.Name == b.Name }
