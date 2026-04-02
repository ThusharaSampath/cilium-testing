#!/bin/bash
set -e

# Hubble Observability Test
# Verifies that Hubble CLI-based and Prometheus-based observability are working.
# 1. Hubble CLI: kubectl exec into Cilium agent to observe L7 traffic
# 2. Prometheus: kubectl exec to query hubble_http_requests_total via cluster-internal URL

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

PROMETHEUS_NS="${PROMETHEUS_NS:-choreo-observability}"
PROMETHEUS_SVC="${PROMETHEUS_SVC:-choreo-system-prometheus}"
PROMETHEUS_PORT="${PROMETHEUS_PORT:-9090}"

OVERALL_RESULT=0

verify_cluster

# --- Test 1: Hubble CLI via Cilium agent pod ---
echo ""
log "=== Test 1: Hubble L7 traffic observation ==="

CILIUM_POD=$(kubectl -n "$CILIUM_NS" get pods -l k8s-app=cilium -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -z "$CILIUM_POD" ]; then
  fail "No Cilium agent pod found in namespace '$CILIUM_NS'."
  OVERALL_RESULT=1
else
  log "Using Cilium pod: $CILIUM_POD"
  log "Running: hubble observe -t l7 --last 10"

  HUBBLE_OUTPUT=$(kubectl -n "$CILIUM_NS" exec "$CILIUM_POD" -c cilium-agent -- \
    hubble observe -t l7 --last 10 2>&1 || true)

  if [ -z "$HUBBLE_OUTPUT" ]; then
    fail "No L7 traffic observed."
    fail "This may indicate Hubble is not running or no L7 traffic is flowing."
    OVERALL_RESULT=1
  else
    LINE_COUNT=$(echo "$HUBBLE_OUTPUT" | wc -l | tr -d ' ')
    log "Captured $LINE_COUNT L7 flow(s). Sample:"
    echo "$HUBBLE_OUTPUT" | head -5 | sed 's/^/  /'
    echo ""
    log "Hubble CLI: PASSED"
  fi
fi

# --- Test 2: Prometheus via kubectl exec ---
echo ""
log "=== Test 2: Prometheus (hubble_http_requests_total) ==="

# Find a pod in the observability namespace with curl available (grafana has it)
GRAFANA_POD=$(kubectl -n "$PROMETHEUS_NS" get pods -l app.kubernetes.io/name=grafana \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)

if [ -z "$GRAFANA_POD" ]; then
  # Fallback: try any pod in the namespace
  GRAFANA_POD=$(kubectl -n "$PROMETHEUS_NS" get pods -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
fi

if [ -z "$GRAFANA_POD" ]; then
  fail "No pod found in '$PROMETHEUS_NS' to exec into for Prometheus query."
  OVERALL_RESULT=1
else
  log "Querying Prometheus via pod: $GRAFANA_POD"
  PROM_RESPONSE=$(kubectl -n "$PROMETHEUS_NS" exec "$GRAFANA_POD" -- \
    curl -s --max-time 10 "http://${PROMETHEUS_SVC}:${PROMETHEUS_PORT}/api/v1/query?query=hubble_http_requests_total" 2>&1 || true)

  if [ -z "$PROM_RESPONSE" ]; then
    fail "No response from Prometheus."
    OVERALL_RESULT=1
  else
    EMPTY_RESULT=$(echo "$PROM_RESPONSE" | grep -o '"result":\[\]' | head -1)
    HAS_RESULT=$(echo "$PROM_RESPONSE" | grep -o '"result":\[' | head -1)

    if [ -n "$EMPTY_RESULT" ]; then
      fail "hubble_http_requests_total returned empty results."
      fail "Hubble metrics may not be flowing to Prometheus."
      OVERALL_RESULT=1
    elif [ -n "$HAS_RESULT" ]; then
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
