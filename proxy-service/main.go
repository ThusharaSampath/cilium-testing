package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

var logger = log.New(os.Stdout, "", 0)

func backendURL() string {
	if url := os.Getenv("BACKEND_SERVICE"); url != "" {
		return url
	}
	return "http://169.254.169.254"
}

func logRequest(r *http.Request) {
	logger.Printf("[%s] %s %s | RemoteAddr: %s | UserAgent: %s",
		time.Now().UTC().Format(time.RFC3339),
		r.Method, r.URL.RequestURI(),
		r.RemoteAddr, r.UserAgent(),
	)
}

func proxyHandler(w http.ResponseWriter, r *http.Request) {
	logRequest(r)

	target := backendURL()
	logger.Printf("forwarding to: %s", target)

	req, err := http.NewRequestWithContext(r.Context(), r.Method, target, r.Body)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to build request: %v", err), http.StatusInternalServerError)
		return
	}
	for key, values := range r.Header {
		for _, v := range values {
			req.Header.Add(key, v)
		}
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("backend error: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for key, values := range resp.Header {
		for _, v := range values {
			w.Header().Add(key, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/", proxyHandler)

	logger.Printf("proxy-service listening on :%s  (BACKEND_SERVICE=%s)", port, backendURL())
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		logger.Fatalf("server error: %v", err)
	}
}
