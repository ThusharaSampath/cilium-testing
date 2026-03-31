#!/bin/bash
set -e

# Hubble Observability Test
# Verifies that Hubble CLI-based and Prometheus-based observability are working.
# 1. Hubble CLI: runs `hubble observe -t l7` and checks for output
# 2. Prometheus: port-forwards to Prometheus and queries hubble_http_requests_total

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

PROMETHEUS_NS="${PROMETHEUS_NS:-choreo-observability}"
PROMETHEUS_SVC="${PROMETHEUS_SVC:-prometheus-prometheus}"
PROMETHEUS_PORT="${PROMETHEUS_PORT:-9090}"
LOCAL_PORT="${LOCAL_PORT:-9091}" # avoid conflict if 9090 is in use

OVERALL_RESULT=0

verify_cluster

# --- Test 1: Hubble CLI ---
echo ""
log "=== Test 1: Hubble CLI (L7 traffic) ==="

if ! command -v hubble &> /dev/null; then
  warn "Hubble CLI not found. Skipping CLI test."
  warn "Install: https://docs.cilium.io/en/stable/gettingstarted/hubble_setup/"
  OVERALL_RESULT=1
else
  log "Running: hubble observe -t l7 (capturing 10 seconds of traffic)..."
  HUBBLE_OUTPUT=$(timeout 10 hubble observe -t l7 2>&1 || true)

  if [ -z "$HUBBLE_OUTPUT" ]; then
    fail "No L7 traffic observed in 10 seconds."
    fail "This may indicate Hubble is not running or no L7 traffic is flowing."
    OVERALL_RESULT=1
  else
    LINE_COUNT=$(echo "$HUBBLE_OUTPUT" | wc -l | tr -d ' ')
    log "Captured $LINE_COUNT L7 flow(s). Sample:"
    echo "$HUBBLE_OUTPUT" | head -5 | sed 's/^/  /'
    log "Hubble CLI: PASSED"
  fi
fi

# --- Test 2: Prometheus ---
echo ""
log "=== Test 2: Prometheus (hubble_http_requests_total) ==="

# Check if the Prometheus service exists
if ! kubectl get svc "$PROMETHEUS_SVC" -n "$PROMETHEUS_NS" > /dev/null 2>&1; then
  fail "Prometheus service '$PROMETHEUS_SVC' not found in namespace '$PROMETHEUS_NS'."
  OVERALL_RESULT=1
else
  # Start port-forward in background
  log "Starting port-forward to $PROMETHEUS_SVC on localhost:$LOCAL_PORT..."
  kubectl -n "$PROMETHEUS_NS" port-forward "svc/$PROMETHEUS_SVC" "$LOCAL_PORT:$PROMETHEUS_PORT" &
  PF_PID=$!

  # Wait for port-forward to be ready
  sleep 3

  # Query Prometheus for hubble metrics (bypass the HTTPS_PROXY for localhost)
  log "Querying hubble_http_requests_total..."
  PROM_RESPONSE=$(curl -s --noproxy localhost --max-time 10 \
    "http://localhost:$LOCAL_PORT/api/v1/query?query=hubble_http_requests_total" 2>&1 || true)

  # Kill port-forward
  kill $PF_PID 2>/dev/null || true
  wait $PF_PID 2>/dev/null || true

  if [ -z "$PROM_RESPONSE" ]; then
    fail "No response from Prometheus."
    OVERALL_RESULT=1
  else
    # Check if we got results
    RESULT_COUNT=$(echo "$PROM_RESPONSE" | grep -o '"result":\[' | head -1)
    EMPTY_RESULT=$(echo "$PROM_RESPONSE" | grep -o '"result":\[\]' | head -1)

    if [ -n "$EMPTY_RESULT" ]; then
      fail "hubble_http_requests_total returned empty results."
      fail "Hubble metrics may not be flowing to Prometheus."
      OVERALL_RESULT=1
    elif [ -n "$RESULT_COUNT" ]; then
      SERIES_COUNT=$(echo "$PROM_RESPONSE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']['result']))" 2>/dev/null || echo "?")
      log "Found $SERIES_COUNT time series for hubble_http_requests_total."
      log "Prometheus Hubble metrics: PASSED"
    else
      fail "Unexpected Prometheus response:"
      echo "$PROM_RESPONSE" | head -5 | sed 's/^/  /'
      OVERALL_RESULT=1
    fi
  fi
fi

# --- Summary ---
echo ""
if [ "$OVERALL_RESULT" -eq 0 ]; then
  log "=== PASSED: Hubble observability test ==="
else
  fail "=== FAILED: Some Hubble observability checks failed ==="
fi

exit $OVERALL_RESULT
