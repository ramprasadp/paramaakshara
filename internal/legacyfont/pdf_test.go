// SPDX-License-Identifier: GPL-3.0-or-later

package legacyfont

import (
	"bytes"
	"fmt"
	"reflect"
	"strings"
	"testing"
)

// samplePDF is a two-page PDF: Arial for the page number, SHREE-SAN-0962
// for उप॑ (from mantrastotra.pdf page 22) and a code with no entry (01),
// SHREE-SAN-0964 (which shares the table) on page 2.
func samplePDF(t testing.TB) []byte {
	t.Helper()
	widths := "[" + strings.Repeat("500 ", 224) + "]"
	font := func(name string) string {
		return "<< /Type /Font /Subtype /TrueType /BaseFont /" + name + " /FirstChar 32 /Widths " + widths + " >>"
	}
	stream := func(s string) string {
		return fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(s), s)
	}
	objs := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /Resources << /Font << /A 7 0 R /S 8 0 R /H 9 0 R >> >> >>",
		"<< /Type /Page /Parent 2 0 R /Contents 5 0 R >>",
		"<< /Type /Page /Parent 2 0 R /Contents 6 0 R >>",
		stream("BT /A 10 Tf 1 0 0 1 72 700 Tm (22) Tj /S 10 Tf 1 0 0 1 200 700 Tm (\\355T\"]\\001) Tj ET"),
		stream("BT /H 10 Tf 1 0 0 1 72 700 Tm (\\355T\"]) Tj ET"),
		font("Arial"),
		font("ABCDEF+SHREE-SAN-0962"),
		font("SHREE-SAN-0964"),
	}
	var b bytes.Buffer
	b.WriteString("%PDF-1.7\n")
	for i, o := range objs {
		fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", i+1, o)
	}
	b.WriteString("trailer\n<< /Root 1 0 R >>\n%%EOF\n")
	return b.Bytes()
}

func TestConvertPDF(t *testing.T) {
	tables, err := Tables()
	if err != nil {
		t.Fatal(err)
	}
	doc, err := ConvertPDF(samplePDF(t), tables)
	if err != nil {
		t.Fatal(err)
	}
	want := &Document{
		Pages: []Page{
			{Number: 1, Lines: []string{"22 उप॑‹01›"}},
			{Number: 2, Lines: []string{"उप॑"}},
		},
		Fonts: []FontUse{
			{Name: "SHREE-SAN-0962", Table: "SHREE-SAN-0962", Bytes: 5},
			{Name: "SHREE-SAN-0964", Table: "SHREE-SAN-0962", Bytes: 4},
			{Name: "Arial", Bytes: 2},
		},
		Unmapped: []Unmapped{{Font: "SHREE-SAN-0962", Code: "01", Count: 1}},
	}
	if !reflect.DeepEqual(doc, want) {
		t.Errorf("got  %+v\nwant %+v", doc, want)
	}
}

func TestConvertPDFRejectsOtherFiles(t *testing.T) {
	if _, err := ConvertPDF([]byte("not a pdf"), nil); err == nil {
		t.Error("accepted a file that is not a PDF")
	}
}

func TestWindows1252(t *testing.T) {
	if got := Windows1252([]byte{'A', 0x85, 0x81, 0xE9, 0x09}); got != "A…‹81›é‹09›" {
		t.Errorf("got %q", got)
	}
}
