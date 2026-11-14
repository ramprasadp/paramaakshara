// SPDX-License-Identifier: GPL-3.0-or-later

package pdfread

import (
	"bytes"
	"compress/zlib"
	"fmt"
	"reflect"
	"testing"
)

func TestLexerObjects(t *testing.T) {
	l := &lexer{b: []byte(`<< /A#20B 12 0 R /S (a\(b\)\101\n) /H <4142 4> /N [1 -2.5 true null /X] >>`)}
	o, err := l.object()
	if err != nil {
		t.Fatal(err)
	}
	want := Dict{
		"A B": Ref{12, 0},
		"S":   String("a(b)A\n"),
		"H":   String("AB@"),
		"N":   Array{1, -2.5, true, nil, Name("X")},
	}
	if !reflect.DeepEqual(o, want) {
		t.Errorf("got %#v\nwant %#v", o, want)
	}
}

func TestLexerNumberNotRef(t *testing.T) {
	l := &lexer{b: []byte("1 0 0 1 72 700 Tm")}
	var got []any
	for {
		o, err := l.object()
		if err != nil {
			break
		}
		got = append(got, o)
	}
	want := []any{1, 0, 0, 1, 72, 700, Keyword("Tm")}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %#v, want %#v", got, want)
	}
}

// buildPDF writes a one-page PDF with a Flate-compressed content stream
// and two simple TrueType fonts. /F2's subset prefix must be stripped.
func buildPDF(t *testing.T, content string) []byte {
	t.Helper()
	var z bytes.Buffer
	zw := zlib.NewWriter(&z)
	zw.Write([]byte(content))
	zw.Close()
	widths := "[" + string(bytes.Repeat([]byte("500 "), 224)) + "]"
	var b bytes.Buffer
	b.WriteString("%PDF-1.7\n")
	objs := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
		"<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>",
		fmt.Sprintf("<< /Length %d /Filter /FlateDecode >>\nstream\n%s\nendstream", z.Len(), z.Bytes()),
		"<< /Type /Font /Subtype /TrueType /BaseFont /Arial /FirstChar 32 /Widths " + widths + " >>",
		"<< /Type /Font /Subtype /TrueType /BaseFont /ABCDEF+SHREE-SAN-0962 /FirstChar 32 /Widths " + widths + " >>",
	}
	for i, o := range objs {
		fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", i+1, o)
	}
	b.WriteString("trailer\n<< /Root 1 0 R /Size 7 >>\n%%EOF\n")
	return b.Bytes()
}

func linesOf(t *testing.T, content string) []Line {
	t.Helper()
	f, err := Open(buildPDF(t, content))
	if err != nil {
		t.Fatal(err)
	}
	pages, err := f.Pages()
	if err != nil {
		t.Fatal(err)
	}
	if len(pages) != 1 {
		t.Fatalf("%d pages, want 1", len(pages))
	}
	g, err := f.Glyphs(pages[0])
	if err != nil {
		t.Fatal(err)
	}
	return Lines(g)
}

type runText struct{ font, code string }

func runs(l Line) []runText {
	var out []runText
	for _, r := range l.Runs {
		name := ""
		if r.Font != nil {
			name = r.Font.Name
		}
		out = append(out, runText{name, string(r.Code)})
	}
	return out
}

func TestLinesRunsAndGaps(t *testing.T) {
	lines := linesOf(t, `
BT /F1 10 Tf 1 0 0 1 72 700 Tm (22) Tj
/F2 10 Tf 1 0 0 1 300 700 Tm (X"S) Tj (e) Tj
/F2 12 Tf 1 0 0 1 72 650 Tm [(\355T)-50("])-400(]) ] TJ
0 -20 Td (\044\044) Tj ET`)
	want := [][]runText{
		{{"Arial", "22"}, {"", ""}, {"SHREE-SAN-0962", `X"Se`}},
		// The small TJ kern (-50) is not a gap; the large one (-400) is.
		{{"SHREE-SAN-0962", "\xEDT\"]"}, {"", ""}, {"SHREE-SAN-0962", "]"}},
		{{"SHREE-SAN-0962", "$$"}},
	}
	if len(lines) != len(want) {
		t.Fatalf("%d lines, want %d: %+v", len(lines), len(want), lines)
	}
	for i := range want {
		if got := runs(lines[i]); !reflect.DeepEqual(got, want[i]) {
			t.Errorf("line %d: got %q, want %q", i+1, got, want[i])
		}
	}
	if lines[2].Y != 630 {
		t.Errorf("Td line y = %v, want 630", lines[2].Y)
	}
}

func TestCTMScalesPositions(t *testing.T) {
	// Text drawn at 1 pt under a 10× matrix still separates two lines
	// 5 units (50 pt) apart, and the state is restored by Q.
	lines := linesOf(t, `q 10 0 0 10 0 0 cm
BT /F1 1 Tf 1 0 0 1 7 70 Tm (a) Tj 1 0 0 1 7 65 Tm (b) Tj ET Q
BT /F1 10 Tf 1 0 0 1 70 600 Tm (c) Tj ET`)
	var ys []float64
	for _, l := range lines {
		ys = append(ys, l.Y)
	}
	if !reflect.DeepEqual(ys, []float64{700, 650, 600}) {
		t.Errorf("line ys = %v, want [700 650 600]", ys)
	}
}

func TestOverprintDropped(t *testing.T) {
	// The year drawn three times, shifted by half a point to look bold,
	// as on the title page of mantrastotra.pdf.
	lines := linesOf(t, `BT /F2 10 Tf 1 0 0 1 72 700 Tm (2013) Tj 1 0 0 1 72.5 700 Tm (2013) Tj
1 0 0 1 72 700.5 Tm (2013) Tj 1 0 0 1 92 700 Tm (13) Tj ET`)
	if len(lines) != 1 || len(lines[0].Runs) != 1 || string(lines[0].Runs[0].Code) != "201313" {
		t.Errorf("got %+v", runs(lines[0]))
	}
}

func TestInlineImageSkipped(t *testing.T) {
	lines := linesOf(t, "BI /W 1 /H 1 ID \x00(EI)\xff EI\nBT /F1 10 Tf (ok) Tj ET")
	if len(lines) != 1 || string(lines[0].Runs[0].Code) != "ok" {
		t.Errorf("got %+v", lines)
	}
}

func TestOpenRejectsNonPDF(t *testing.T) {
	if _, err := Open([]byte("hello")); err == nil {
		t.Error("non-PDF accepted")
	}
}
