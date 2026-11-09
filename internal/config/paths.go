// SPDX-License-Identifier: GPL-3.0-or-later

package config

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// Paths are the per-OS locations from spec §9.6.
type Paths struct {
	ConfigDir   string // holds config.json and session.json
	ConfigFile  string
	SessionFile string
	RecoveryDir string
	BackupsDir  string
	LogFile     string
	DocumentDir string // default document folder
}

// DefaultPaths resolves the locations for the current user and OS.
func DefaultPaths() (Paths, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return Paths{}, err
	}
	var p Paths
	switch runtime.GOOS {
	case "darwin":
		p.ConfigDir = filepath.Join(home, "Library", "Application Support", "Paramaakshara")
		p.RecoveryDir = filepath.Join(p.ConfigDir, "recovery")
		p.BackupsDir = filepath.Join(p.ConfigDir, "backups")
		p.LogFile = filepath.Join(home, "Library", "Logs", "Paramaakshara", "paramaakshara.log")
	default:
		configHome := os.Getenv("XDG_CONFIG_HOME")
		if configHome == "" {
			configHome = filepath.Join(home, ".config")
		}
		stateHome := os.Getenv("XDG_STATE_HOME")
		if stateHome == "" {
			stateHome = filepath.Join(home, ".local", "state")
		}
		state := filepath.Join(stateHome, "paramaakshara")
		p.ConfigDir = filepath.Join(configHome, "paramaakshara")
		p.RecoveryDir = filepath.Join(state, "recovery")
		p.BackupsDir = filepath.Join(state, "backups")
		p.LogFile = filepath.Join(state, "paramaakshara.log")
	}
	p.ConfigFile = filepath.Join(p.ConfigDir, "config.json")
	p.SessionFile = filepath.Join(p.ConfigDir, "session.json")
	p.DocumentDir = filepath.Join(home, "Documents", "Paramaakshara")
	return p, nil
}

// ExpandHome replaces a leading "~" or "~/" with the user's home directory.
func ExpandHome(path string) (string, error) {
	if path != "~" && !strings.HasPrefix(path, "~/") {
		return path, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, path[1:]), nil
}
