// SPDX-License-Identifier: GPL-3.0-or-later

// Package folder shows the operating system's folder and file pickers
// on the computer the daemon runs on (spec §10.1b). Only a folder or file
// the user picks there is returned; the browser never supplies a path.
package folder

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

var (
	// ErrCancelled means the user closed the picker without a choice.
	ErrCancelled = errors.New("nothing chosen")
	// ErrUnavailable means this system has no picker the daemon can show.
	ErrUnavailable = errors.New("no folder picker available")
)

var mu sync.Mutex // one picker at a time

// Pick shows the folder picker with the given prompt, starting in start
// if it is not empty, and returns the absolute path of the chosen folder.
// Cancelling ctx closes the picker.
func Pick(ctx context.Context, prompt, start string) (string, error) {
	dir, err := pick(ctx, prompt, start, false)
	if err != nil {
		return "", err
	}
	return checkDir(dir)
}

// PickFile shows the file picker for documents (.itx and .txt where the
// picker can filter), starting in the folder start if it is not empty,
// and returns the absolute path of the chosen file.
func PickFile(ctx context.Context, prompt, start string) (string, error) {
	file, err := pick(ctx, prompt, start, true)
	if err != nil {
		return "", err
	}
	return checkFile(file)
}

func pick(ctx context.Context, prompt, start string, file bool) (string, error) {
	if !mu.TryLock() {
		return "", errors.New("a picker is already open")
	}
	defer mu.Unlock()
	name, args, err := command(prompt, start, file)
	if err != nil {
		return "", err
	}
	var stdout, stderr bytes.Buffer
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	runErr := cmd.Run()
	if ctx.Err() != nil {
		return "", ctx.Err()
	}
	chosen := strings.TrimSpace(stdout.String())
	if runErr != nil || chosen == "" {
		// Every picker exits non-zero, with no output, when cancelled.
		var exit *exec.ExitError
		if chosen == "" && (runErr == nil || errors.As(runErr, &exit)) {
			return "", ErrCancelled
		}
		return "", fmt.Errorf("%s: %v: %s", filepath.Base(name), runErr, strings.TrimSpace(stderr.String()))
	}
	return chosen, nil
}

func checkDir(dir string) (string, error) {
	dir = filepath.Clean(dir)
	if !filepath.IsAbs(dir) {
		return "", fmt.Errorf("picker returned a relative path")
	}
	info, err := os.Stat(dir)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", fmt.Errorf("%s is not a folder", dir)
	}
	return dir, nil
}

func checkFile(file string) (string, error) {
	file = filepath.Clean(file)
	if !filepath.IsAbs(file) {
		return "", fmt.Errorf("picker returned a relative path")
	}
	info, err := os.Stat(file)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("%s is not a file", file)
	}
	return file, nil
}

// command returns the picker program for this system: a folder picker,
// or with file set a picker for one existing file.
func command(prompt, start string, file bool) (string, []string, error) {
	switch runtime.GOOS {
	case "darwin":
		// activate brings the dialog in front of the browser.
		script := []string{"-e", "activate", "-e", "set p to " + appleString(prompt)}
		choose := "choose folder with prompt p"
		if file {
			choose = "choose file with prompt p"
		}
		if start != "" {
			script = append(script, "-e", "set d to POSIX file "+appleString(start))
			choose += " default location d"
		}
		script = append(script, "-e", "POSIX path of ("+choose+")")
		return "osascript", script, nil
	case "windows":
		ps := "Add-Type -AssemblyName System.Windows.Forms; "
		if file {
			ps += "$d = New-Object System.Windows.Forms.OpenFileDialog; " +
				"$d.Title = " + psString(prompt) + "; " +
				"$d.Filter = 'ITRANS (*.itx;*.txt)|*.itx;*.txt|All files (*.*)|*.*'; "
			if start != "" {
				ps += "$d.InitialDirectory = " + psString(start) + "; "
			}
			ps += "if ($d.ShowDialog() -eq 'OK') { [Console]::Out.Write($d.FileName) } else { exit 1 }"
		} else {
			ps += "$d = New-Object System.Windows.Forms.FolderBrowserDialog; " +
				"$d.Description = " + psString(prompt) + "; "
			if start != "" {
				ps += "$d.SelectedPath = " + psString(start) + "; "
			}
			ps += "if ($d.ShowDialog() -eq 'OK') { [Console]::Out.Write($d.SelectedPath) } else { exit 1 }"
		}
		return "powershell", []string{"-NoProfile", "-STA", "-Command", ps}, nil
	default:
		if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
			return "", nil, ErrUnavailable
		}
		if p, err := exec.LookPath("zenity"); err == nil {
			args := []string{"--file-selection", "--title=" + prompt}
			if file {
				args = append(args, "--file-filter=ITRANS | *.itx *.txt", "--file-filter=All files | *")
			} else {
				args = append(args, "--directory")
			}
			if start != "" {
				args = append(args, "--filename="+start+"/")
			}
			return p, args, nil
		}
		if p, err := exec.LookPath("kdialog"); err == nil {
			if start == "" {
				start = "."
			}
			if file {
				return p, []string{"--title", prompt, "--getopenfilename", start, "*.itx *.txt"}, nil
			}
			return p, []string{"--title", prompt, "--getexistingdirectory", start}, nil
		}
		return "", nil, ErrUnavailable
	}
}

// appleString quotes s as an AppleScript string literal.
func appleString(s string) string {
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s) + `"`
}

// psString quotes s as a PowerShell single-quoted string.
func psString(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}
