package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
)

const serviceName = "public-service"

var logger = log.New(os.Stdout, "", 0)

type response struct {
	Service string `json:"service"`
	Path    string `json:"path"`
	Method  string `json:"method"`
	Time    string `json:"time"`
}

func logRequest(r *http.Request) {
	logger.Printf("[%s] %s %s | RemoteAddr: %s | UserAgent: %s",
		time.Now().UTC().Format(time.RFC3339),
		r.Method, r.URL.RequestURI(),
		r.RemoteAddr, r.UserAgent(),
	)
}

func handle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	logRequest(r)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response{
		Service: serviceName,
		Path:    r.URL.Path,
		Method:  r.Method,
		Time:    time.Now().UTC().Format(time.RFC3339),
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	http.HandleFunc("/", handle)
	http.HandleFunc("/test", handle)
	logger.Printf("%s listening on :%s", serviceName, port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		logger.Fatalf("server error: %v", err)
	}
}
