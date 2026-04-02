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

var services = []struct {
	name   string
	envVar string
}{
	{"org-service", "ORG_SERVICE_URL"},
	{"public-service", "PUBLIC_SERVICE_URL"},
	{"project-service", "PROJECT_SERVICE_URL"},
}

func callService(name, baseURL string) serviceResult {
	url := baseURL + "/test"
	resp, err := http.Get(url)
	if err != nil {
		return serviceResult{Name: name, Error: fmt.Sprintf("request failed: %v", err)}
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return serviceResult{Name: name, Status: resp.StatusCode, Error: fmt.Sprintf("read body failed: %v", err)}
	}

	return serviceResult{Name: name, Status: resp.StatusCode, Response: json.RawMessage(body)}
}

func handleTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	logger.Printf("[%s] %s %s | RemoteAddr: %s",
		time.Now().UTC().Format(time.RFC3339),
		r.Method, r.URL.RequestURI(), r.RemoteAddr,
	)

	type result struct {
		index int
		value serviceResult
	}
	ch := make(chan result, len(services))

	for i, svc := range services {
		go func(idx int, name, envVar string) {
			url := os.Getenv(envVar)
			if url == "" {
				ch <- result{idx, serviceResult{Name: name, Error: fmt.Sprintf("env %s not set", envVar)}}
				return
			}
			ch <- result{idx, callService(name, url)}
		}(i, svc.name, svc.envVar)
	}

	results := make([]serviceResult, len(services))
	for range services {
		r := <-ch
		results[r.index] = r.value
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(testResponse{
		Service: serviceName,
		Time:    time.Now().UTC().Format(time.RFC3339),
		Results: results,
	})
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

	for _, svc := range services {
		url := os.Getenv(svc.envVar)
		if url != "" {
			logger.Printf("  %s = %s", svc.envVar, url)
		} else {
			logger.Printf("  %s = (not set)", svc.envVar)
		}
	}

	http.HandleFunc("/test", handleTest)
	http.HandleFunc("/health", handleHealth)
	logger.Printf("%s listening on :%s", serviceName, port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		logger.Fatalf("server error: %v", err)
	}
}
