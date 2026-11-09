// SPDX-License-Identifier: GPL-3.0-or-later

// Package logging points the standard library logger at the log file
// (spec §9.8).
package logging

import (
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"gopkg.in/natefinch/lumberjack.v2"
)

// Stderr is the log file value that means "log to standard error".
const Stderr = "-"

// Setup sends the standard logger to file, or to standard error when
// file is Stderr. The returned closer stops rotation and closes the file.
func Setup(file string, maxBackups int) (io.Closer, error) {
	log.SetFlags(log.LstdFlags)
	if file == Stderr {
		log.SetOutput(os.Stderr)
		return io.NopCloser(nil), nil
	}
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		return nil, err
	}
	lj := &lumberjack.Logger{
		Filename:   file,
		MaxBackups: maxBackups,
		// Rotation is daily (below). MaxSize is a 1 TB safety cap so that
		// lumberjack's size-based rotation never triggers in practice.
		MaxSize:   1 << 20,
		LocalTime: true,
	}
	// A short-lived daemon may never see midnight; rotate a file left over
	// from an earlier day before writing to it.
	if info, err := os.Stat(file); err == nil && !sameDay(info.ModTime(), time.Now()) {
		if err := lj.Rotate(); err != nil {
			return nil, err
		}
	}
	log.SetOutput(lj)
	return &rotator{lj: lj, stop: startDaily(lj)}, nil
}

type rotator struct {
	lj   *lumberjack.Logger
	stop chan struct{}
}

func (r *rotator) Close() error {
	close(r.stop)
	log.SetOutput(os.Stderr)
	return r.lj.Close()
}

// startDaily rotates lj at each local midnight until stop is closed.
func startDaily(lj *lumberjack.Logger) chan struct{} {
	stop := make(chan struct{})
	go func() {
		for {
			t := time.NewTimer(time.Until(nextMidnight(time.Now())))
			select {
			case <-t.C:
				if err := lj.Rotate(); err != nil {
					log.Printf("log rotation: %v", err)
				}
			case <-stop:
				t.Stop()
				return
			}
		}
	}()
	return stop
}

func nextMidnight(now time.Time) time.Time {
	y, m, d := now.Date()
	return time.Date(y, m, d+1, 0, 0, 0, 0, now.Location())
}

func sameDay(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return ay == by && am == bm && ad == bd
}
