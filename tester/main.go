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

type serviceConfig struct {
	name   string
	envVar string
}

var services = map[string]serviceConfig{
	"org":     {name: "org-service", envVar: "ORG_SERVICE_URL"},
	"public":  {name: "public-service", envVar: "PUBLIC_SERVICE_URL"},
	"project": {name: "project-service", envVar: "PROJECT_SERVICE_URL"},
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

		url := os.Getenv(svc.envVar)
		var result serviceResult
		if url == "" {
			result = serviceResult{Name: svc.name, Error: fmt.Sprintf("env %s not set", svc.envVar)}
		} else {
			result = callService(svc.name, url)
		}

		w.Header().Set("Content-Type", "application/json")
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
			url := os.Getenv(svc.envVar)
			if url == "" {
				ch <- indexedResult{idx, serviceResult{Name: svc.name, Error: fmt.Sprintf("env %s not set", svc.envVar)}}
				return
			}
			ch <- indexedResult{idx, callService(svc.name, url)}
		}(i, services[key])
	}

	results := make([]serviceResult, len(keys))
	for range keys {
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

	for _, key := range []string{"org", "public", "project"} {
		svc := services[key]
		url := os.Getenv(svc.envVar)
		if url != "" {
			logger.Printf("  %s = %s", svc.envVar, url)
		} else {
			logger.Printf("  %s = (not set)", svc.envVar)
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
