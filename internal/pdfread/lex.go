// SPDX-License-Identifier: GPL-3.0-or-later

package pdfread

import (
	"bytes"
	"errors"
	"fmt"
	"strconv"
)

// PDF object types. Integers are int, reals float64, booleans bool and
// null nil.
type (
	Name    string
	String  []byte // literal or hex string, bytes as stored
	Keyword string // a bare word: a content stream operator, or "R"/"obj" during parsing
	Array   []any
	Dict    map[Name]any
	Ref     struct{ Num, Gen int }
	Stream  struct {
		Dict Dict
		Raw  []byte // still encoded
	}
)

var (
	errEOF   = errors.New("pdfread: unexpected end of data")
	errDepth = errors.New("pdfread: arrays or dictionaries nested too deeply")
)

// maxDepth limits nesting so that a crafted file cannot exhaust the stack.
const maxDepth = 100

type lexer struct {
	b     []byte
	pos   int
	depth int
}

func isWhite(c byte) bool {
	return c == 0 || c == '\t' || c == '\n' || c == '\f' || c == '\r' || c == ' '
}

func isDelim(c byte) bool {
	return bytes.IndexByte([]byte("()<>[]{}/%"), c) >= 0
}

func (l *lexer) skipSpace() {
	for l.pos < len(l.b) {
		c := l.b[l.pos]
		if isWhite(c) {
			l.pos++
		} else if c == '%' {
			for l.pos < len(l.b) && l.b[l.pos] != '\n' && l.b[l.pos] != '\r' {
				l.pos++
			}
		} else {
			return
		}
	}
}

// word reads a run of regular characters.
func (l *lexer) word() []byte {
	start := l.pos
	for l.pos < len(l.b) && !isWhite(l.b[l.pos]) && !isDelim(l.b[l.pos]) {
		l.pos++
	}
	return l.b[start:l.pos]
}

// object parses the next object. At the end of an array or dictionary
// it returns the Keyword "]" or ">>".
func (l *lexer) object() (any, error) {
	l.skipSpace()
	if l.pos >= len(l.b) {
		return nil, errEOF
	}
	switch c := l.b[l.pos]; {
	case c == '/':
		l.pos++
		return l.name(), nil
	case c == '(':
		l.pos++
		return l.literal()
	case c == '<':
		if l.pos+1 < len(l.b) && l.b[l.pos+1] == '<' {
			l.pos += 2
			return l.dict()
		}
		l.pos++
		return l.hex()
	case c == '>':
		if l.pos+1 < len(l.b) && l.b[l.pos+1] == '>' {
			l.pos += 2
			return Keyword(">>"), nil
		}
		return nil, fmt.Errorf("pdfread: stray '>' at %d", l.pos)
	case c == '[':
		l.pos++
		return l.array()
	case c == ']':
		l.pos++
		return Keyword("]"), nil
	case c == '{' || c == '}':
		l.pos++
		return Keyword(string(c)), nil
	case c == ')':
		return nil, fmt.Errorf("pdfread: stray ')' at %d", l.pos)
	}
	w := l.word()
	if len(w) == 0 {
		return nil, fmt.Errorf("pdfread: unexpected byte %q at %d", l.b[l.pos], l.pos)
	}
	if n, ok := number(w); ok {
		if i, isInt := n.(int); isInt && i >= 0 {
			if ref, ok := l.refAfter(i); ok {
				return ref, nil
			}
		}
		return n, nil
	}
	switch string(w) {
	case "true":
		return true, nil
	case "false":
		return false, nil
	case "null":
		return nil, nil
	}
	return Keyword(w), nil
}

// refAfter checks for "gen R" after an object number and consumes it.
func (l *lexer) refAfter(num int) (Ref, bool) {
	save := l.pos
	l.skipSpace()
	if gen, ok := number(l.word()); ok {
		if g, isInt := gen.(int); isInt {
			l.skipSpace()
			if string(l.word()) == "R" {
				return Ref{num, g}, true
			}
		}
	}
	l.pos = save
	return Ref{}, false
}

func number(w []byte) (any, bool) {
	if len(w) == 0 || bytes.IndexFunc(w, func(r rune) bool {
		return !(r >= '0' && r <= '9' || r == '+' || r == '-' || r == '.')
	}) >= 0 {
		return nil, false
	}
	s := string(w)
	if bytes.IndexByte(w, '.') < 0 {
		if i, err := strconv.Atoi(s); err == nil {
			return i, true
		}
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return nil, false
	}
	return f, true
}

func unhex(c byte) (byte, bool) {
	switch {
	case c >= '0' && c <= '9':
		return c - '0', true
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10, true
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10, true
	}
	return 0, false
}

func (l *lexer) name() Name {
	w := l.word()
	if bytes.IndexByte(w, '#') < 0 {
		return Name(w)
	}
	out := make([]byte, 0, len(w))
	for i := 0; i < len(w); i++ {
		if w[i] == '#' && i+2 < len(w) {
			hi, ok1 := unhex(w[i+1])
			lo, ok2 := unhex(w[i+2])
			if ok1 && ok2 {
				out = append(out, hi<<4|lo)
				i += 2
				continue
			}
		}
		out = append(out, w[i])
	}
	return Name(out)
}

func (l *lexer) literal() (String, error) {
	var out []byte
	depth := 1
	for l.pos < len(l.b) {
		c := l.b[l.pos]
		l.pos++
		switch c {
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				return out, nil
			}
		case '\r':
			// An end of line inside a string reads as \n.
			if l.pos < len(l.b) && l.b[l.pos] == '\n' {
				l.pos++
			}
			c = '\n'
		case '\\':
			if l.pos >= len(l.b) {
				return nil, errEOF
			}
			e := l.b[l.pos]
			l.pos++
			switch e {
			case 'n':
				c = '\n'
			case 'r':
				c = '\r'
			case 't':
				c = '\t'
			case 'b':
				c = '\b'
			case 'f':
				c = '\f'
			case '\r':
				if l.pos < len(l.b) && l.b[l.pos] == '\n' {
					l.pos++
				}
				continue
			case '\n':
				continue
			default:
				if e >= '0' && e <= '7' {
					v := int(e - '0')
					for k := 0; k < 2 && l.pos < len(l.b) && l.b[l.pos] >= '0' && l.b[l.pos] <= '7'; k++ {
						v = v*8 + int(l.b[l.pos]-'0')
						l.pos++
					}
					c = byte(v)
				} else {
					c = e // \( \) \\ and unknown escapes
				}
			}
		}
		out = append(out, c)
	}
	return nil, errEOF
}

func (l *lexer) hex() (String, error) {
	var out []byte
	var hi byte
	half := false
	for l.pos < len(l.b) {
		c := l.b[l.pos]
		l.pos++
		if c == '>' {
			if half {
				out = append(out, hi<<4)
			}
			return out, nil
		}
		v, ok := unhex(c)
		if !ok {
			continue // whitespace
		}
		if half {
			out = append(out, hi<<4|v)
		} else {
			hi = v
		}
		half = !half
	}
	return nil, errEOF
}

func (l *lexer) array() (Array, error) {
	if l.depth++; l.depth > maxDepth {
		return nil, errDepth
	}
	defer func() { l.depth-- }()
	var a Array
	for {
		o, err := l.object()
		if err != nil {
			return nil, err
		}
		if k, ok := o.(Keyword); ok && k == "]" {
			return a, nil
		}
		a = append(a, o)
	}
}

func (l *lexer) dict() (Dict, error) {
	if l.depth++; l.depth > maxDepth {
		return nil, errDepth
	}
	defer func() { l.depth-- }()
	d := Dict{}
	for {
		k, err := l.object()
		if err != nil {
			return nil, err
		}
		if kw, ok := k.(Keyword); ok && kw == ">>" {
			return d, nil
		}
		key, ok := k.(Name)
		if !ok {
			return nil, fmt.Errorf("pdfread: dictionary key %v is not a name", k)
		}
		v, err := l.object()
		if err != nil {
			return nil, err
		}
		d[key] = v
	}
}
