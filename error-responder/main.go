package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

var logger = log.New(os.Stdout, "", 0)

func logRequest(r *http.Request) {
	logger.Printf("[%s] %s %s %s | RemoteAddr: %s | UserAgent: %s",
		time.Now().UTC().Format(time.RFC3339),
		r.Method,
		r.Host,
		r.URL.RequestURI(),
		r.RemoteAddr,
		r.UserAgent(),
	)
}

func handler(w http.ResponseWriter, r *http.Request) {
	logRequest(r)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusInternalServerError)
	fmt.Fprintln(w, `{"error":"Internal Server Error","status":500}`)
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/", handler)

	logger.Printf("error-responder listening on :%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		logger.Fatalf("server error: %v", err)
	}
}
