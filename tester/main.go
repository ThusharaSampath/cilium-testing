package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"golang.org/x/oauth2/clientcredentials"
)

const serviceName = "tester"

var logger = log.New(os.Stdout, "", 0)

type serviceResult struct {
	Name     string          `json:"name"`
	Status   int             `json:"status"`
	Response json.RawMessage `json:"response,omitempty"`
	Error    string          `json:"error,omitempty"`
}

type testResponse struct {
	Service string          `json:"service"`
	Time    string          `json:"time"`
	Results []serviceResult `json:"results"`
}

// serviceConfig holds connection env var info for one target service.
// Choreo injects env vars based on the connection name:
//
//	CHOREO_<NAME>_SERVICEURL, CHOREO_<NAME>_CHOREOAPIKEY,
//	CHOREO_<NAME>_CONSUMERKEY, CHOREO_<NAME>_CONSUMERSECRET, CHOREO_<NAME>_TOKENURL
//
// Project-scoped services only need SERVICEURL + CHOREOAPIKEY.
// Org/Public-scoped services also need OAuth2 client credentials.
type serviceConfig struct {
	name      string
	envPrefix string // e.g. "CHOREO_TESTER_TO_ORG"
	useOAuth  bool   // true for org/public (gateway auth required)
}

var services = map[string]serviceConfig{
	"org":     {name: "org-service", envPrefix: "CHOREO_TESTER_TO_ORG", useOAuth: true},
	"public":  {name: "public-service", envPrefix: "CHOREO_TESTER_TO_PUBLIC", useOAuth: true},
	"project": {name: "project-service", envPrefix: "CHOREO_TESTER_TO_PROJECT", useOAuth: false},
}

func callService(svc serviceConfig) serviceResult {
	serviceURL := os.Getenv(svc.envPrefix + "_SERVICEURL")
	if serviceURL == "" {
		return serviceResult{Name: svc.name, Error: fmt.Sprintf("env %s_SERVICEURL not set", svc.envPrefix)}
	}

	url := serviceURL + "/test"
	choreoAPIKey := os.Getenv(svc.envPrefix + "_CHOREOAPIKEY")

	var client *http.Client

	if svc.useOAuth {
		consumerKey := os.Getenv(svc.envPrefix + "_CONSUMERKEY")
		consumerSecret := os.Getenv(svc.envPrefix + "_CONSUMERSECRET")
		tokenURL := os.Getenv(svc.envPrefix + "_TOKENURL")

		if consumerKey == "" || consumerSecret == "" || tokenURL == "" {
			return serviceResult{Name: svc.name, Error: fmt.Sprintf(
				"OAuth2 env vars missing for %s (need CONSUMERKEY, CONSUMERSECRET, TOKENURL)", svc.envPrefix)}
		}

		creds := clientcredentials.Config{
			ClientID:     consumerKey,
			ClientSecret: consumerSecret,
			TokenURL:     tokenURL,
		}
		client = creds.Client(context.Background())
		client.Timeout = 15 * time.Second
	} else {
		client = &http.Client{Timeout: 10 * time.Second}
	}

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return serviceResult{Name: svc.name, Error: fmt.Sprintf("build request failed: %v", err)}
	}

	if choreoAPIKey != "" {
		req.Header.Add("Choreo-API-Key", choreoAPIKey)
	}

	resp, err := client.Do(req)
	if err != nil {
		return serviceResult{Name: svc.name, Error: fmt.Sprintf("request failed: %v", err)}
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return serviceResult{Name: svc.name, Status: resp.StatusCode, Error: fmt.Sprintf("read body failed: %v", err)}
	}

	return serviceResult{Name: svc.name, Status: resp.StatusCode, Response: json.RawMessage(body)}
}

func logRequest(r *http.Request) {
	logger.Printf("[%s] %s %s | RemoteAddr: %s",
		time.Now().UTC().Format(time.RFC3339),
		r.Method, r.URL.RequestURI(), r.RemoteAddr,
	)
}

func handleSingle(svc serviceConfig) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		logRequest(r)

		result := callService(svc)

		w.Header().Set("Content-Type", "application/json")
		if result.Error != "" || result.Status < 200 || result.Status >= 300 {
			w.WriteHeader(http.StatusInternalServerError)
		}
		json.NewEncoder(w).Encode(testResponse{
			Service: serviceName,
			Time:    time.Now().UTC().Format(time.RFC3339),
			Results: []serviceResult{result},
		})
	}
}

func handleAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	logRequest(r)

	type indexedResult struct {
		index int
		value serviceResult
	}

	keys := []string{"org", "public", "project"}
	ch := make(chan indexedResult, len(keys))

	for i, key := range keys {
		go func(idx int, svc serviceConfig) {
			ch <- indexedResult{idx, callService(svc)}
		}(i, services[key])
	}

	results := make([]serviceResult, len(keys))
	for range keys {
		r := <-ch
		results[r.index] = r.value
	}

	resp := testResponse{
		Service: serviceName,
		Time:    time.Now().UTC().Format(time.RFC3339),
		Results: results,
	}

	hasFailure := false
	for _, res := range results {
		if res.Error != "" || res.Status < 200 || res.Status >= 300 {
			hasFailure = true
			break
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if hasFailure {
		w.WriteHeader(http.StatusInternalServerError)
	}
	json.NewEncoder(w).Encode(resp)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	for _, key := range []string{"org", "public", "project"} {
		svc := services[key]
		url := os.Getenv(svc.envPrefix + "_SERVICEURL")
		if url != "" {
			logger.Printf("  %s_SERVICEURL = %s", svc.envPrefix, url)
		} else {
			logger.Printf("  %s_SERVICEURL = (not set)", svc.envPrefix)
		}
	}

	http.HandleFunc("/test", handleAll)
	http.HandleFunc("/test/org", handleSingle(services["org"]))
	http.HandleFunc("/test/public", handleSingle(services["public"]))
	http.HandleFunc("/test/project", handleSingle(services["project"]))
	http.HandleFunc("/health", handleHealth)

	logger.Printf("%s listening on :%s", serviceName, port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		logger.Fatalf("server error: %v", err)
	}
}
