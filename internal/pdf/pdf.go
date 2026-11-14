// SPDX-License-Identifier: GPL-3.0-or-later

// Package pdf makes PDFs of the output text with a Chromium-based
// browser installed on the computer, run headless (spec §10.1b, ADR
// 0004). The browser shapes Devanagari, Kannada, Tamil and the Vedic
// accents as on screen and embeds the bundled fonts; Go has no shaping
// engine in the standard library.
package pdf

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"html/template"
	"io/fs"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Request is the text to print and how to lay it out.
type Request struct {
	Title  string // optional heading
	Name   string // document title in the PDF metadata
	Page   string // "A4" or "Letter"
	SizePt int
	Lines  []string
}

// Validate checks the layout values.
func (r Request) Validate() error {
	if r.Page != "A4" && r.Page != "Letter" {
		return fmt.Errorf("page must be A4 or Letter")
	}
	if r.SizePt < 6 || r.SizePt > 72 {
		return fmt.Errorf("size_pt must be between 6 and 72")
	}
	return nil
}

// ErrUnavailable means no browser was found to make the PDF.
var ErrUnavailable = errors.New("no Chrome, Edge or Chromium found")

// Font is a bundled font file and the family name the page gives it.
type Font struct{ Family, File string }

// Fonts are the bundled fonts, as in frontend/public/fonts.
var Fonts = []Font{
	{"Paramaakshara Noto Serif Devanagari", "NotoSerifDevanagari-Regular.ttf"},
	{"Paramaakshara Noto Serif Kannada", "NotoSerifKannada-Regular.ttf"},
	{"Paramaakshara Noto Serif Tamil", "NotoSerifTamil-Regular.ttf"},
}

// Maker runs the browser. One PDF is made at a time.
type Maker struct {
	browser string // configured path; "" searches the usual places
	fonts   fs.FS  // holds the files of Fonts
	timeout time.Duration
	mu      sync.Mutex
}

// New returns a Maker. browser is the configured browser path or "".
func New(browser string, fonts fs.FS) *Maker {
	return &Maker{browser: browser, fonts: fonts, timeout: 60 * time.Second}
}

// Browser returns the browser that will be used, or ErrUnavailable.
// It is looked up on every call, so a browser installed while the
// daemon runs is found.
func (m *Maker) Browser() (string, error) {
	if m.browser != "" {
		if _, err := os.Stat(m.browser); err != nil {
			return "", fmt.Errorf("%w: pdf.browser %s: %v", ErrUnavailable, m.browser, err)
		}
		return m.browser, nil
	}
	for _, c := range candidates() {
		if filepath.IsAbs(c) {
			if info, err := os.Stat(c); err == nil && !info.IsDir() {
				return c, nil
			}
		} else if p, err := exec.LookPath(c); err == nil {
			return p, nil
		}
	}
	return "", ErrUnavailable
}

func candidates() []string {
	switch runtime.GOOS {
	case "darwin":
		var out []string
		home, _ := os.UserHomeDir()
		for _, app := range []string{
			"Google Chrome.app/Contents/MacOS/Google Chrome",
			"Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			"Chromium.app/Contents/MacOS/Chromium",
			"Brave Browser.app/Contents/MacOS/Brave Browser",
		} {
			out = append(out, filepath.Join("/Applications", app))
			if home != "" {
				out = append(out, filepath.Join(home, "Applications", app))
			}
		}
		return out
	case "windows":
		var out []string
		for _, env := range []string{"ProgramFiles", "ProgramFiles(x86)", "LocalAppData"} {
			dir := os.Getenv(env)
			if dir == "" {
				continue
			}
			out = append(out,
				filepath.Join(dir, `Google\Chrome\Application\chrome.exe`),
				filepath.Join(dir, `Microsoft\Edge\Application\msedge.exe`),
			)
		}
		return out
	default:
		return []string{"google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"}
	}
}

// Make returns the PDF for r. Cancelling ctx stops the browser.
func (m *Maker) Make(ctx context.Context, r Request) ([]byte, error) {
	if err := r.Validate(); err != nil {
		return nil, err
	}
	browser, err := m.Browser()
	if err != nil {
		return nil, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	dir, err := os.MkdirTemp("", "paramaakshara-pdf-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	for _, f := range Fonts {
		data, err := fs.ReadFile(m.fonts, f.File)
		if err != nil {
			return nil, fmt.Errorf("bundled font: %w", err)
		}
		if err := os.WriteFile(filepath.Join(dir, f.File), data, 0o600); err != nil {
			return nil, err
		}
	}
	page := filepath.Join(dir, "page.html")
	var html bytes.Buffer
	if err := pageTemplate.Execute(&html, pageData(r)); err != nil {
		return nil, err
	}
	if err := os.WriteFile(page, html.Bytes(), 0o600); err != nil {
		return nil, err
	}
	out := filepath.Join(dir, "out.pdf")

	ctx, cancel := context.WithTimeout(ctx, m.timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, browser,
		"--headless",
		"--disable-gpu",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-extensions",
		"--disable-sync",
		"--disable-background-networking",
		"--user-data-dir="+filepath.Join(dir, "profile"),
		"--no-pdf-header-footer",
		"--print-to-pdf="+out,
		fileURL(page),
	)
	cmd.WaitDelay = 5 * time.Second
	var output bytes.Buffer
	cmd.Stdout = &output
	cmd.Stderr = &output
	runErr := cmd.Run()
	if ctx.Err() != nil {
		return nil, fmt.Errorf("%s: %w", filepath.Base(browser), ctx.Err())
	}
	// Some builds write the PDF and then fail while shutting down
	// ("Teardown watchdog expired"); a complete PDF is still good.
	data, err := os.ReadFile(out)
	if err != nil || !bytes.HasPrefix(data, []byte("%PDF-")) || !bytes.Contains(data[max(0, len(data)-1024):], []byte("%%EOF")) {
		if runErr == nil {
			runErr = errors.New("no PDF written")
		}
		return nil, fmt.Errorf("%s: %v: %s", filepath.Base(browser), runErr, lastLine(output.String()))
	}
	return data, nil
}

func fileURL(p string) string {
	p = filepath.ToSlash(p)
	if !strings.HasPrefix(p, "/") {
		p = "/" + p // Windows drive letter
	}
	return (&url.URL{Scheme: "file", Path: p}).String()
}

func lastLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	l := lines[len(lines)-1]
	if len(l) > 300 {
		l = l[:300]
	}
	return l
}

type line struct {
	Text  string
	Blank bool
}

type data struct {
	Request
	Fonts      []Font
	Families   template.CSS
	Paragraphs []line
}

func pageData(r Request) data {
	d := data{Request: r, Fonts: Fonts}
	var families []string
	for _, f := range Fonts {
		families = append(families, `"`+f.Family+`"`)
	}
	d.Families = template.CSS(strings.Join(families, ", ") + ", serif")
	for _, l := range r.Lines {
		d.Paragraphs = append(d.Paragraphs, line{Text: l, Blank: l == ""})
	}
	return d
}

// pageTemplate mirrors the print view of the editor (#print-view in
// frontend/src/styles.css). The page loads nothing but the fonts next
// to it.
var pageTemplate = template.Must(template.New("page").Parse(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src file:">
<title>{{.Name}}</title>
<style>
{{- range .Fonts}}
@font-face { font-family: "{{.Family}}"; src: url("{{.File}}") format("truetype"); font-display: block; }
{{- end}}
@page { size: {{.Page}}; margin: 18mm 16mm; }
body { margin: 0; color: #000; background: #fff; font-family: {{.Families}}; font-size: {{.SizePt}}pt; line-height: 1.9; }
h1 { font-size: 1.3em; font-weight: normal; text-align: center; margin: 0 0 1em; }
p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; break-inside: avoid; }
</style>
</head>
<body>
{{- if .Title}}
<h1>{{.Title}}</h1>
{{- end}}
{{- range .Paragraphs}}
<p>{{if .Blank}}&nbsp;{{else}}{{.Text}}{{end}}</p>
{{- end}}
</body>
</html>
`))
