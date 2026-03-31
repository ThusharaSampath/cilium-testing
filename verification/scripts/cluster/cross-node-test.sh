#!/bin/bash
set -e

# Cross-Node Communication Test
# Applies DaemonSets (client + server) to test cross-node request reliability.
# Monitors pods for a configurable duration and checks for restarts.
# A few restarts in the first 1-2 minutes are expected; none after that.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
YAML_FILE="$REPO_ROOT/cross-node-request-drop-test.yaml"
NAMESPACE="${NAMESPACE:-default}"
MONITOR_DURATION="${MONITOR_DURATION:-300}" # 5 minutes default
SETTLE_TIME="${SETTLE_TIME:-120}"           # 2 minutes settle window
CHECK_INTERVAL=15                           # check every 15 seconds

cleanup() {
  log "Cleaning up test resources..."
  kubectl delete -f "$YAML_FILE" -n "$NAMESPACE" --ignore-not-found 2>/dev/null
  log "Cleanup complete."
}

verify_cluster

# Clean up any previous test resources
kubectl delete -f "$YAML_FILE" -n "$NAMESPACE" --ignore-not-found 2>/dev/null || true
sleep 2

# Apply the test manifest
log "Applying cross-node test manifest to namespace '$NAMESPACE'..."
kubectl apply -f "$YAML_FILE" -n "$NAMESPACE"

# Wait for server DaemonSet to roll out (client may crash-loop initially — that's expected)
log "Waiting for server DaemonSet to be ready..."
kubectl rollout status daemonset/request-drop-test-server -n "$NAMESPACE" --timeout=120s
log "Server pods ready. Client pods may restart initially — monitoring will track this."

# Get node count for reference
NODE_COUNT=$(kubectl get nodes --no-headers | wc -l | tr -d ' ')
log "Cluster has $NODE_COUNT nodes. Expecting $NODE_COUNT client pods and $NODE_COUNT server pods."

# Monitor phase
log "Monitoring pods for $MONITOR_DURATION seconds (settle window: first ${SETTLE_TIME}s)..."
log ""

START_TIME=$(date +%s)
SETTLED=false
POST_SETTLE_RESTARTS_DETECTED=false
BASELINE_CLIENT_RESTARTS=0
BASELINE_SERVER_RESTARTS=0
TOTAL_CLIENT_RESTARTS=0
TOTAL_SERVER_RESTARTS=0

while true; do
  ELAPSED=$(( $(date +%s) - START_TIME ))

  if [ "$ELAPSED" -ge "$MONITOR_DURATION" ]; then
    break
  fi

  # Get restart counts for client pods
  CLIENT_RESTARTS=$(kubectl get pods -n "$NAMESPACE" -l app=request-drop-test-client \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.containerStatuses[0].restartCount}{"\t"}{.status.phase}{"\n"}{end}' 2>/dev/null)

  SERVER_RESTARTS=$(kubectl get pods -n "$NAMESPACE" -l app=request-drop-test-server \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.containerStatuses[0].restartCount}{"\t"}{.status.phase}{"\n"}{end}' 2>/dev/null)

  TOTAL_CLIENT_RESTARTS=0
  TOTAL_SERVER_RESTARTS=0

  while IFS=$'\t' read -r pod restarts phase; do
    [ -z "$pod" ] && continue
    TOTAL_CLIENT_RESTARTS=$(( TOTAL_CLIENT_RESTARTS + restarts ))
  done <<< "$CLIENT_RESTARTS"

  while IFS=$'\t' read -r pod restarts phase; do
    [ -z "$pod" ] && continue
    TOTAL_SERVER_RESTARTS=$(( TOTAL_SERVER_RESTARTS + restarts ))
  done <<< "$SERVER_RESTARTS"

  PHASE_LABEL="SETTLING"
  if [ "$ELAPSED" -ge "$SETTLE_TIME" ]; then
    PHASE_LABEL="STABLE"
    if [ "$SETTLED" = false ]; then
      SETTLED=true
      BASELINE_CLIENT_RESTARTS=$TOTAL_CLIENT_RESTARTS
      BASELINE_SERVER_RESTARTS=$TOTAL_SERVER_RESTARTS
      log "--- Settle window ended. Baseline restarts: client=$BASELINE_CLIENT_RESTARTS server=$BASELINE_SERVER_RESTARTS ---"
    fi

    # Check for new restarts after settle period
    if [ "$TOTAL_CLIENT_RESTARTS" -gt "$BASELINE_CLIENT_RESTARTS" ] || \
       [ "$TOTAL_SERVER_RESTARTS" -gt "$BASELINE_SERVER_RESTARTS" ]; then
      POST_SETTLE_RESTARTS_DETECTED=true
    fi
  fi

  REMAINING=$(( MONITOR_DURATION - ELAPSED ))
  printf "\r[%3ds/%ds] [%s] Client restarts: %d | Server restarts: %d | Remaining: %ds   " \
    "$ELAPSED" "$MONITOR_DURATION" "$PHASE_LABEL" "$TOTAL_CLIENT_RESTARTS" "$TOTAL_SERVER_RESTARTS" "$REMAINING"

  sleep "$CHECK_INTERVAL"
done

echo ""
echo ""

# Final status
log "=== Final Pod Status ==="
kubectl get pods -n "$NAMESPACE" -l "app in (request-drop-test-client, request-drop-test-server)" \
  -o wide --no-headers | while read -r line; do
  echo "  $line"
done

echo ""

# Result
if [ "$POST_SETTLE_RESTARTS_DETECTED" = true ]; then
  NEW_CLIENT=$(( TOTAL_CLIENT_RESTARTS - BASELINE_CLIENT_RESTARTS ))
  NEW_SERVER=$(( TOTAL_SERVER_RESTARTS - BASELINE_SERVER_RESTARTS ))
  fail "=== FAILED: Cross-node communication test ==="
  fail "Restarts detected after settle period: client=+$NEW_CLIENT server=+$NEW_SERVER"
  fail "This indicates cross-node request drops."
  cleanup
  exit 1
else
  log "=== PASSED: Cross-node communication test ==="
  log "No restarts detected after the ${SETTLE_TIME}s settle window."
  if [ "$TOTAL_CLIENT_RESTARTS" -gt 0 ] || [ "$TOTAL_SERVER_RESTARTS" -gt 0 ]; then
    warn "Initial restarts during settle window: client=$TOTAL_CLIENT_RESTARTS server=$TOTAL_SERVER_RESTARTS (expected)"
  fi
  cleanup
  exit 0
fi
