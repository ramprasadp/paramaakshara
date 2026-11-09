// SPDX-License-Identifier: GPL-3.0-or-later

// Command paramaakshara runs the local editor daemon.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/ramprasadp/paramaakshara/frontend"
	"github.com/ramprasadp/paramaakshara/internal/server"
)

// version is set at build time with -ldflags "-X main.version=...".
var version = "dev"

func main() {
	port := flag.Int("port", 7531, "TCP port to listen on (loopback only)")
	showVersion := flag.Bool("version", false, "print the version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Println(version)
		return
	}

	log.SetOutput(os.Stderr)
	log.SetFlags(log.LstdFlags)

	addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(*port))
	srv := &http.Server{
		Addr:              addr,
		Handler:           server.New(frontend.Assets(), version),
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errc := make(chan error, 1)
	go func() {
		log.Printf("paramaakshara %s listening on http://%s/", version, addr)
		errc <- srv.ListenAndServe()
	}()

	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen on %s: %v", addr, err)
		}
	case <-ctx.Done():
		log.Printf("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("shutdown: %v", err)
		}
	}
}
