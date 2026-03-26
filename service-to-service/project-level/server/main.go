package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
)

var logger = log.New(os.Stdout, "", 0)

func logRequest(r *http.Request) {
	logger.Printf("[%s] %s %s | RemoteAddr: %s",
		time.Now().UTC().Format(time.RFC3339),
		r.Method, r.URL.RequestURI(), r.RemoteAddr,
	)
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	logRequest(r)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"service": "project-level-server",
		"message": "Server is up",
	})
}

func helloHandler(w http.ResponseWriter, r *http.Request) {
	logRequest(r)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"service": "project-level-server",
		"message": "Hello from server!",
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	http.HandleFunc("/", rootHandler)
	http.HandleFunc("/hello", helloHandler)
	logger.Printf("project-level-server listening on :%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		logger.Fatalf("server error: %v", err)
	}
}
