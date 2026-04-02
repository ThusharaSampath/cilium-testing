package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

var logger = log.New(os.Stdout, "", 0)

// serverURL reads the service URL injected by Choreo via the connection.
// Choreo injects: CHOREO_CLIENT_TO_SERVER_SERVICEURL
func serverURL() string {
	if url := os.Getenv("CHOREO_CLIENT_TO_SERVER_SERVICEURL"); url != "" {
		return url
	}
	// local fallback for development
	return "http://localhost:8081"
}

func logRequest(r *http.Request) {
	logger.Printf("[%s] %s %s | RemoteAddr: %s",
		time.Now().UTC().Format(time.RFC3339),
		r.Method, r.URL.RequestURI(), r.RemoteAddr,
	)
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	logRequest(r)

	target := fmt.Sprintf("%s/hello", serverURL())
	logger.Printf("calling server: %s", target)

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to build request: %v", err), http.StatusInternalServerError)
		return
	}
	if apiKey := os.Getenv("CHOREO_CLIENT_TO_SERVER_CHOREOAPIKEY"); apiKey != "" {
		req.Header.Add("Choreo-API-Key", apiKey)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("server unreachable: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "failed to read server response", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	json.NewEncoder(w).Encode(map[string]any{
		"service":        "project-level-client",
		"server_url":     target,
		"server_status":  resp.StatusCode,
		"server_payload": json.RawMessage(body),
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	http.HandleFunc("/", rootHandler)
	logger.Printf("project-level-client listening on :%s (server=%s)", port, serverURL())
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		logger.Fatalf("server error: %v", err)
	}
}
