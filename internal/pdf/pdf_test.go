// SPDX-License-Identifier: GPL-3.0-or-later

package pdf

import (
	"bytes"
	"context"
	"errors"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
)

// The bundled fonts, as the daemon embeds them after a frontend build.
var fonts = os.DirFS("../../frontend/public/fonts")

func page(t *testing.T, r Request) string {
	t.Helper()
	var b bytes.Buffer
	if err := pageTemplate.Execute(&b, pageData(r)); err != nil {
		t.Fatal(err)
	}
	return b.String()
}

func TestPageEscapesTextAndKeepsBlankLines(t *testing.T) {
	html := page(t, Request{
		Title: "<b>sūkta</b>", Name: "sukta", Page: "Letter", SizePt: 18,
		Lines: []string{"स भूमिं॑ <script>", "", "a & b"},
	})
	for _, want := range []string{
		"<title>sukta</title>",
		"<h1>&lt;b&gt;sūkta&lt;/b&gt;</h1>",
		"<p>स भूमिं॑ &lt;script&gt;</p>",
		"<p>&nbsp;</p>",
		"<p>a &amp; b</p>",
		"size: Letter;",
		"font-size: 18pt;",
		`src: url("NotoSerifDevanagari-Regular.ttf")`,
	} {
		if !strings.Contains(html, want) {
			t.Errorf("page lacks %q:\n%s", want, html)
		}
	}
	if strings.Contains(page(t, Request{Page: "A4", SizePt: 18}), "<h1>") {
		t.Error("heading without a title")
	}
}

func TestValidate(t *testing.T) {
	for _, r := range []Request{{Page: "A5", SizePt: 18}, {Page: "A4", SizePt: 2}, {Page: "A4", SizePt: 100}} {
		if r.Validate() == nil {
			t.Errorf("%+v accepted", r)
		}
	}
}

func TestConfiguredBrowserMustExist(t *testing.T) {
	m := New(filepath.Join(t.TempDir(), "no-browser"), fonts)
	if _, err := m.Make(context.Background(), Request{Page: "A4", SizePt: 18}); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("want ErrUnavailable, got %v", err)
	}
}

func TestMakeEmbedsBundledFonts(t *testing.T) {
	maker := New(os.Getenv("PARAMAAKSHARA_PDF_BROWSER"), fonts)
	if _, err := maker.Browser(); err != nil {
		t.Skipf("no browser to make PDFs: %v", err)
	}
	data, err := maker.Make(context.Background(), Request{
		Name: "sukta", Page: "A4", SizePt: 18,
		Lines: []string{"स॒हस्र॑शीर्षा॒ पुरु॑षः", "", "ಸ॒ಹಸ್ರ॑ಶೀರ್ಷಾ", "தஸ்மா᳚த்"},
	})
	if err != nil {
		t.Fatal(err)
	}
	// A4 is 595.3 x 841.9 pt; browsers round it slightly.
	m := regexp.MustCompile(`/MediaBox \[0 0 ([0-9.]+) ([0-9.]+)\]`).FindSubmatch(data)
	if m == nil {
		t.Fatal("PDF has no MediaBox")
	}
	w, _ := strconv.ParseFloat(string(m[1]), 64)
	h, _ := strconv.ParseFloat(string(m[2]), 64)
	if math.Abs(w-595.3) > 2 || math.Abs(h-841.9) > 2 {
		t.Errorf("page is %.1f x %.1f pt, not A4", w, h)
	}
	for _, want := range []string{
		"NotoSerifDevanagari-Regular",
		"NotoSerifKannada-Regular",
		"NotoSerifTamil-Regular",
	} {
		if !bytes.Contains(data, []byte(want)) {
			t.Errorf("PDF lacks %q", want)
		}
	}
}
