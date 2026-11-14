// SPDX-License-Identifier: GPL-3.0-or-later

// Package legacyfont converts text in legacy (non-Unicode) Indic fonts to
// Unicode with per-font data tables (docs/legacy-fonts.md). Such fonts
// store glyphs in visual order, so conversion is a longest-match lookup
// followed by reordering into Unicode's logical order.
package legacyfont

import (
	"embed"
	"encoding/json"
	"fmt"
	"path"
	"strconv"
	"strings"
)

//go:embed tables/*.json
var tableFiles embed.FS

// Kinds of glyph sequence, which decide reordering.
const (
	Consonant = "consonant" // full consonant or conjunct; ends a cluster
	Half      = "half"      // half form (consonant + virama) inside a cluster
	Stem      = "stem"      // vertical stem completing the half form before it
	Vowel     = "vowel"     // independent vowel
	Pre       = "pre"       // sign drawn before its cluster (the i sign)
	Reph      = "reph"      // ra + virama drawn after the cluster it precedes
	Sign      = "sign"      // vowel sign or virama after its consonant
	Subjoined = "subjoined" // consonant sign below (ra, ya, na); part of the cluster
	Modifier  = "modifier"  // anusvara, visarga, chandrabindu
	Accent    = "accent"    // Vedic accent
	Space     = "space"
	Punct     = "punct"
	None      = "none" // part of a glyph drawn in pieces; no text
)

var kinds = map[string]bool{
	Consonant: true, Half: true, Stem: true, Vowel: true, Pre: true, Reph: true, Sign: true, Subjoined: true,
	Modifier: true, Accent: true, Space: true, Punct: true, None: true,
}

// Entry maps one glyph code sequence to text of one kind, or, for a
// glyph that combines two (a reph with an anusvara), to several Units.
type Entry struct {
	Codes string `json:"codes"` // hex bytes, space separated
	Kind  string `json:"kind,omitempty"`
	Text  string `json:"text,omitempty"`
	Units []Unit `json:"units,omitempty"`
	Note  string `json:"note,omitempty"`
	codes []byte
}

// Unit is text of one kind.
type Unit struct {
	Kind string `json:"kind"`
	Text string `json:"text"`
}

// Compose joins two vowel signs drawn as separate glyphs, such as aa + e
// for o, also when an accent was drawn between them.
type Compose struct {
	First  string `json:"first"`
	Second string `json:"second"`
	Text   string `json:"text"`
	Note   string `json:"note,omitempty"`
}

// Table is the mapping for one font.
type Table struct {
	Font    string    `json:"font"`
	Also    []string  `json:"also,omitempty"` // fonts with the same encoding
	Source  string    `json:"source"`
	Glyphs  []Entry   `json:"glyphs"`
	Compose []Compose `json:"compose,omitempty"`
	longest int
	byCodes map[string]*Entry
	compose map[[2]string]string
}

// Tables loads the built-in tables, keyed by font name, including the
// names a table lists under "also".
func Tables() (map[string]*Table, error) {
	files, err := tableFiles.ReadDir("tables")
	if err != nil {
		return nil, err
	}
	out := map[string]*Table{}
	for _, f := range files {
		data, err := tableFiles.ReadFile(path.Join("tables", f.Name()))
		if err != nil {
			return nil, err
		}
		t, err := parseTable(data)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", f.Name(), err)
		}
		for _, name := range append([]string{t.Font}, t.Also...) {
			if _, dup := out[name]; dup {
				return nil, fmt.Errorf("%s: font %s has two tables", f.Name(), name)
			}
			out[name] = t
		}
	}
	return out, nil
}

func parseTable(data []byte) (*Table, error) {
	var t Table
	if err := json.Unmarshal(data, &t); err != nil {
		return nil, err
	}
	t.byCodes = map[string]*Entry{}
	for i := range t.Glyphs {
		e := &t.Glyphs[i]
		if len(e.Units) == 0 {
			e.Units = []Unit{{e.Kind, e.Text}}
		} else if e.Kind != "" || e.Text != "" {
			return nil, fmt.Errorf("codes %q: both kind and units", e.Codes)
		}
		for _, u := range e.Units {
			if !kinds[u.Kind] {
				return nil, fmt.Errorf("codes %q: unknown kind %q", e.Codes, u.Kind)
			}
		}
		for _, h := range strings.Fields(e.Codes) {
			b, err := strconv.ParseUint(h, 16, 8)
			if err != nil {
				return nil, fmt.Errorf("codes %q: %w", e.Codes, err)
			}
			e.codes = append(e.codes, byte(b))
		}
		if len(e.codes) == 0 {
			return nil, fmt.Errorf("entry %d has no codes", i)
		}
		if _, dup := t.byCodes[string(e.codes)]; dup {
			return nil, fmt.Errorf("codes %q listed twice", e.Codes)
		}
		t.byCodes[string(e.codes)] = e
		t.longest = max(t.longest, len(e.codes))
	}
	t.compose = map[[2]string]string{}
	for _, c := range t.Compose {
		t.compose[[2]string{c.First, c.Second}] = c.Text
	}
	return &t, nil
}

type unit struct {
	kind, text string
	code       []byte // the codes, for kind "unknown"
}

// Convert returns the Unicode text for codes in this font, and the codes
// it has no entry for. An unmapped code is kept in the text as ‹XX› so
// that nothing disappears silently.
func (t *Table) Convert(b []byte) (string, []byte) {
	var units []unit
	for i := 0; i < len(b); {
		var e *Entry
		for n := min(t.longest, len(b)-i); n > 0; n-- {
			if e = t.byCodes[string(b[i:i+n])]; e != nil {
				break
			}
		}
		if e == nil {
			units = append(units, unknown(b[i:i+1]))
			i++
			continue
		}
		for _, u := range e.Units {
			units = append(units, unit{kind: u.Kind, text: u.Text, code: e.codes})
		}
		i += len(e.codes)
	}
	var sb strings.Builder
	var unmapped []byte
	for _, u := range reorder(units, t.compose) {
		sb.WriteString(u.text)
		if u.kind == "unknown" {
			unmapped = append(unmapped, u.code...)
		}
	}
	return sb.String(), unmapped
}

func unknown(code []byte) unit {
	var sb strings.Builder
	for _, c := range code {
		fmt.Fprintf(&sb, "\u2039%02X\u203A", c)
	}
	return unit{kind: "unknown", text: sb.String(), code: code}
}

// reorder turns visual order into Unicode order:
//   - a stem turns the half form before it into a full consonant, also
//     when accents were drawn in between;
//   - a pre sign moves after the consonant that ends the next cluster,
//     and after a subjoined sign of that cluster;
//   - a reph moves to the start of the cluster before it;
//   - vowel signs, anusvara and visarga move before accents on the same
//     syllable (ADR 0002), and two signs listed in compose are joined;
//   - an accent drawn after a space belongs to the syllable before the
//     space.
func reorder(in []unit, compose map[[2]string]string) []unit {
	var out []unit
	var pre []unit
	cluster := -1 // index in out where the current cluster starts
	for _, u := range in {
		prev := ""
		if len(out) > 0 {
			prev = out[len(out)-1].kind
		}
		switch u.kind {
		case Pre:
			pre = append(pre, u)
		case Half, Consonant:
			if prev != Half {
				cluster = len(out)
			}
			out = append(out, u)
			if u.kind == Consonant {
				out, pre = append(out, pre...), nil
			}
		case Stem:
			j := beforeAccents(out)
			if j == 0 || out[j-1].kind != Half {
				out = append(out, unknown(u.code))
				break
			}
			out[j-1].kind = Consonant
			out[j-1].text = strings.TrimSuffix(out[j-1].text, "\u094D")
			for k, p := range pre {
				out = insert(out, j+k, p)
			}
			pre = nil
		case Reph:
			if cluster >= 0 {
				out = insert(out, cluster, u)
			} else {
				out = append(out, u)
			}
		case Accent:
			j := len(out)
			for j > 0 && out[j-1].kind == Space {
				j--
			}
			if j == 0 || out[j-1].kind == Punct {
				j = len(out) // nothing to attach to
			}
			out = insert(out, j, u)
		case Subjoined:
			j := len(out)
			for j > 0 && (out[j-1].kind == Pre || out[j-1].kind == Accent) {
				j--
			}
			out = insert(out, j, u)
		case Sign:
			j := beforeAccents(out)
			if j > 0 && out[j-1].kind == Sign {
				if c, ok := compose[[2]string{out[j-1].text, u.text}]; ok {
					out[j-1].text = c
					break
				}
			}
			out = insert(out, j, u)
		case Modifier:
			out = insert(out, beforeAccents(out), u)
		case None:
		default:
			if u.kind == Vowel || u.kind == Space || u.kind == Punct {
				cluster = -1
			}
			out = append(out, u)
		}
	}
	return append(out, pre...)
}

// beforeAccents returns the index after the last unit that is not an
// accent.
func beforeAccents(out []unit) int {
	j := len(out)
	for j > 0 && out[j-1].kind == Accent {
		j--
	}
	return j
}

func insert(s []unit, i int, u unit) []unit {
	s = append(s, unit{})
	copy(s[i+1:], s[i:])
	s[i] = u
	return s
}
