// SPDX-License-Identifier: GPL-3.0-or-later

// Command paramaakshara runs the local editor daemon.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/ramprasadp/paramaakshara/frontend"
	"github.com/ramprasadp/paramaakshara/internal/config"
	"github.com/ramprasadp/paramaakshara/internal/instance"
	"github.com/ramprasadp/paramaakshara/internal/logging"
	"github.com/ramprasadp/paramaakshara/internal/server"
)

// version is set at build time with -ldflags "-X main.version=...".
var version = "dev"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "paramaakshara:", err)
		os.Exit(1)
	}
}

type flags struct {
	config    string
	port      int
	logFile   string
	noBrowser bool
	version   bool
	set       map[string]bool // flags given on the command line
}

func parseFlags() flags {
	var f flags
	flag.StringVar(&f.config, "config", "", "config file `path` (default: per-OS location)")
	flag.IntVar(&f.port, "port", 0, "TCP `port` to listen on, loopback only (default 7531)")
	flag.StringVar(&f.logFile, "log-file", "", "log file `path`; \"-\" logs to standard error")
	flag.BoolVar(&f.noBrowser, "no-browser", false, "do not open the browser; print the sign-in link instead")
	flag.BoolVar(&f.version, "version", false, "print the version and exit")
	flag.Parse()
	f.set = map[string]bool{}
	flag.Visit(func(fl *flag.Flag) { f.set[fl.Name] = true })
	return f
}

// loadConfig applies defaults, config file, environment and flags, in
// that order of precedence (spec §9.6).
func loadConfig(f flags, paths config.Paths) (config.Config, string, []string, error) {
	cfgPath, required := paths.ConfigFile, false
	if v := os.Getenv("PARAMAAKSHARA_CONFIG"); v != "" {
		cfgPath, required = v, true
	}
	if f.set["config"] {
		cfgPath, required = f.config, true
	}
	cfg, warnings, err := config.Load(cfgPath, config.Default(paths.DocumentDir), required)
	if err != nil {
		return cfg, cfgPath, nil, err
	}

	if v := os.Getenv("PARAMAAKSHARA_PORT"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil {
			return cfg, cfgPath, nil, fmt.Errorf("PARAMAAKSHARA_PORT %q: not a number", v)
		}
		cfg.Server.Port = p
	}
	if v := os.Getenv("PARAMAAKSHARA_LOG_FILE"); v != "" {
		cfg.Logging.File = v
	}
	if f.set["port"] {
		cfg.Server.Port = f.port
	}
	if f.set["log-file"] {
		cfg.Logging.File = f.logFile
	}
	if f.noBrowser {
		cfg.Server.OpenBrowser = false
	}
	if cfg.Logging.File == "" {
		cfg.Logging.File = paths.LogFile
	}
	if err := cfg.ExpandPaths(); err != nil {
		return cfg, cfgPath, nil, err
	}
	return cfg, cfgPath, warnings, cfg.Validate()
}

func run() error {
	f := parseFlags()
	if f.version {
		fmt.Println(version)
		return nil
	}

	paths, err := config.DefaultPaths()
	if err != nil {
		return err
	}
	cfg, cfgPath, warnings, err := loadConfig(f, paths)
	if err != nil {
		return err
	}
	sessionPath := filepath.Join(filepath.Dir(cfgPath), "session.json")
	port := cfg.Server.Port
	addr := net.JoinHostPort(cfg.Server.ListenAddress, strconv.Itoa(port))

	ln, err := net.Listen("tcp", addr)
	if errors.Is(err, syscall.EADDRINUSE) {
		return openRunning(port, sessionPath, cfg.Server.OpenBrowser)
	}
	if err != nil {
		return fmt.Errorf("listen on %s: %w", addr, err)
	}

	logCloser, err := logging.Setup(cfg.Logging.File, cfg.Logging.MaxBackups)
	if err != nil {
		ln.Close()
		return fmt.Errorf("log file %s: %w", cfg.Logging.File, err)
	}
	defer logCloser.Close()
	log.Printf("paramaakshara %s starting, config %s", version, cfgPath)
	for _, w := range warnings {
		log.Printf("config warning: %s", w)
		if cfg.Logging.File != logging.Stderr {
			fmt.Fprintln(os.Stderr, "paramaakshara: warning:", w)
		}
	}

	// Each new launch token goes to session.json, so a second launch can
	// sign a browser in to this instance.
	auth := server.NewAuth(func(token string) {
		s := instance.Session{Port: port, PID: os.Getpid(), Token: token}
		if err := instance.WriteSession(sessionPath, s); err != nil {
			log.Printf("write %s: %v", sessionPath, err)
		}
	})
	defer os.Remove(sessionPath)

	shutdown := make(chan struct{}, 1)
	srv := &http.Server{
		Handler: server.New(server.Options{
			Assets:  frontend.Assets(),
			Version: version,
			Port:    port,
			Auth:    auth,
			Shutdown: func() {
				select {
				case shutdown <- struct{}{}:
				default:
				}
			},
		}),
		ReadHeaderTimeout: 10 * time.Second,
		ErrorLog:          log.New(io.Discard, "", 0),
	}

	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()
	log.Printf("listening on http://%s/", addr)

	fmt.Printf("Paramaakshara %s running at http://%s/\n", version, addr)
	if cfg.Logging.File != logging.Stderr {
		fmt.Printf("Log: %s\n", cfg.Logging.File)
	}
	signIn(instance.Session{Port: port, Token: auth.Token()}, cfg.Server.OpenBrowser)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-ctx.Done():
		log.Printf("signal received, shutting down")
	case <-shutdown:
		log.Printf("shutdown requested, shutting down")
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
	log.Printf("stopped")
	return nil
}

// openRunning signs the browser in to an instance already listening on
// port, or explains why the port cannot be used (spec §9.7).
func openRunning(port int, sessionPath string, openBrowser bool) error {
	if !instance.IsParamaakshara(port) {
		return fmt.Errorf("port %d is in use by another program; choose another with --port or server.port in the config file", port)
	}
	s, err := instance.ReadSession(sessionPath)
	if err != nil || s.Port != port || s.Token == "" {
		return fmt.Errorf("Paramaakshara is already running on port %d, but its session file %s could not be used: open http://127.0.0.1:%d/ in a browser that is already signed in, or stop it and start again", port, sessionPath, port)
	}
	fmt.Printf("Paramaakshara is already running at http://127.0.0.1:%d/\n", port)
	signIn(s, openBrowser)
	return nil
}

// signIn opens the browser at the sign-in link, or prints the link when
// the browser is not to be opened or cannot be.
func signIn(s instance.Session, openBrowser bool) {
	if openBrowser {
		err := instance.OpenBrowser(s.AuthURL())
		if err == nil {
			return
		}
		fmt.Fprintln(os.Stderr, "paramaakshara: could not open a browser:", err)
	}
	fmt.Printf("Open this link to sign in (it works once): %s\n", s.AuthURL())
}
