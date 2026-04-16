#!/bin/bash
set -e

# Gateway Error Monitor
# Watches external gateway (choreo-connect) router logs for 403 responses
# and "upstream not found" errors over a configurable time window.
# Reports counts at the end.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

if [ "$CLUSTER" = "OS" ]; then
  APIM_NS="${APIM_NS:-choreo-apim}"
else
  APIM_NS="${APIM_NS:-dev-choreo-apim}"
fi
WATCH_DURATION="${WATCH_DURATION:-600}" # 10 minutes default
CHECK_INTERVAL=10                       # poll every 10 seconds
ROUTER_CONTAINER="choreo-connect-router"

verify_cluster

# Discover all external gateway deployments
log "Discovering external gateway deployments in namespace '$APIM_NS'..."
DEPLOYMENTS=$(kubectl get deploy -n "$APIM_NS" --no-headers -o custom-columns=":metadata.name" \
  | grep "choreo-connect-deployment-external" || true)

if [ -z "$DEPLOYMENTS" ]; then
  fail "No external gateway deployments found in namespace '$APIM_NS'."
  exit 1
fi

log "Found external gateway deployments:"
for dep in $DEPLOYMENTS; do
  echo "  - $dep"
done

# Get all router pods from external gateway deployments
LABEL_SELECTOR=""
for dep in $DEPLOYMENTS; do
  if [ -z "$LABEL_SELECTOR" ]; then
    LABEL_SELECTOR="app=$dep"
  else
    LABEL_SELECTOR="$LABEL_SELECTOR,app=$dep"
  fi
done

# Get pods by matching deployment names via owner references
PODS=""
for dep in $DEPLOYMENTS; do
  RS=$(kubectl get rs -n "$APIM_NS" --no-headers -o custom-columns=":metadata.name,:metadata.ownerReferences[0].name" \
    | awk -v d="$dep" '$2 == d {print $1}')
  for rs in $RS; do
    DEP_PODS=$(kubectl get pods -n "$APIM_NS" --no-headers -o custom-columns=":metadata.name,:metadata.ownerReferences[0].name" \
      | awk -v r="$rs" '$2 == r {print $1}')
    PODS="$PODS $DEP_PODS"
  done
done
PODS=$(echo "$PODS" | xargs) # trim whitespace

if [ -z "$PODS" ]; then
  fail "No router pods found for external gateway deployments."
  exit 1
fi

log "Monitoring router pods:"
for pod in $PODS; do
  echo "  - $pod ($ROUTER_CONTAINER)"
done

echo ""
log "Watching logs for $WATCH_DURATION seconds..."
log "Looking for: HTTP 403 responses, 'upstream not found' errors"
echo ""

# Start background log streams into temp files
TMPDIR_MONITOR=$(mktemp -d)
trap "rm -rf $TMPDIR_MONITOR" EXIT

SINCE_TIME="${WATCH_DURATION}s"
START_TIME=$(date +%s)

# Stream logs from each pod in background
PIDS=""
for pod in $PODS; do
  LOG_FILE="$TMPDIR_MONITOR/${pod}.log"
  kubectl logs -f "$pod" -c "$ROUTER_CONTAINER" -n "$APIM_NS" --since="${SINCE_TIME}" \
    > "$LOG_FILE" 2>/dev/null &
  PIDS="$PIDS $!"
done

# Monitor loop — show live counts
while true; do
  ELAPSED=$(( $(date +%s) - START_TIME ))

  if [ "$ELAPSED" -ge "$WATCH_DURATION" ]; then
    break
  fi

  TOTAL_403=0
  TOTAL_UPSTREAM=0

  for pod in $PODS; do
    LOG_FILE="$TMPDIR_MONITOR/${pod}.log"
    if [ -f "$LOG_FILE" ]; then
      COUNT_403=$(grep -c ' 403 ' "$LOG_FILE" 2>/dev/null || true)
      COUNT_UPSTREAM=$(grep -ci 'upstream not found' "$LOG_FILE" 2>/dev/null || true)
      TOTAL_403=$(( TOTAL_403 + COUNT_403 ))
      TOTAL_UPSTREAM=$(( TOTAL_UPSTREAM + COUNT_UPSTREAM ))
    fi
  done

  REMAINING=$(( WATCH_DURATION - ELAPSED ))
  printf "\r[%3ds/%ds] 403s: %d | upstream_not_found: %d | Remaining: %ds   " \
    "$ELAPSED" "$WATCH_DURATION" "$TOTAL_403" "$TOTAL_UPSTREAM" "$REMAINING"

  sleep "$CHECK_INTERVAL"
done

# Kill background log streams
for pid in $PIDS; do
  kill "$pid" 2>/dev/null || true
done
wait 2>/dev/null || true

echo ""
echo ""

# Final counts per pod
log "=== Gateway Error Report (${WATCH_DURATION}s window) ==="
echo ""

GRAND_403=0
GRAND_UPSTREAM=0

for pod in $PODS; do
  LOG_FILE="$TMPDIR_MONITOR/${pod}.log"
  if [ -f "$LOG_FILE" ]; then
    COUNT_403=$(grep -c ' 403 ' "$LOG_FILE" 2>/dev/null || true)
    COUNT_UPSTREAM=$(grep -ci 'upstream not found' "$LOG_FILE" 2>/dev/null || true)
    GRAND_403=$(( GRAND_403 + COUNT_403 ))
    GRAND_UPSTREAM=$(( GRAND_UPSTREAM + COUNT_UPSTREAM ))
    echo "  Pod: $pod"
    echo "    403 responses:       $COUNT_403"
    echo "    upstream not found:  $COUNT_UPSTREAM"
    echo ""
  fi
done

log "Total across all external gateways:"
echo "  403 responses:       $GRAND_403"
echo "  upstream not found:  $GRAND_UPSTREAM"
echo ""

if [ "$GRAND_403" -gt 0 ] || [ "$GRAND_UPSTREAM" -gt 0 ]; then
  warn "=== ATTENTION: Errors detected in gateway logs ==="
  if [ "$GRAND_403" -gt 0 ]; then
    warn "  $GRAND_403 HTTP 403 responses found"
  fi
  if [ "$GRAND_UPSTREAM" -gt 0 ]; then
    warn "  $GRAND_UPSTREAM 'upstream not found' errors found"
  fi
  exit 1
else
  log "=== CLEAN: No 403s or upstream-not-found errors detected ==="
  exit 0
fi
