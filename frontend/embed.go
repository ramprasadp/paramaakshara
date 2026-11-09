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

// Assets returns the built frontend rooted at dist.
func Assets() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}
	return sub
}
