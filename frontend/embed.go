// SPDX-License-Identifier: GPL-3.0-or-later

// Package frontend embeds the built frontend assets.
package frontend

import (
	"embed"
	"io/fs"
)

// dist holds the output of the Vite build. The directory contains only
// .gitkeep until `make frontend` has run.
//
//go:embed all:dist
var dist embed.FS

// fonts are the bundled fonts, embedded on their own so the daemon can
// make PDFs (internal/pdf) even before the frontend is built.
//
//go:embed public/fonts/*.ttf
var fonts embed.FS

// Fonts returns the bundled .ttf files, by file name.
func Fonts() fs.FS {
	sub, err := fs.Sub(fonts, "public/fonts")
	if err != nil {
		panic(err)
	}
	return sub
}

// Assets returns the built frontend rooted at dist.
func Assets() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}
	return sub
}
