#!/bin/bash
set -e

# Metadata Endpoint Blocking Test
# Verifies that pods cannot reach the cloud metadata endpoint (169.254.169.254).
# Cilium should block this via egressDeny CiliumClusterwideNetworkPolicy.
# Spins up a temporary pod, attempts to curl the metadata endpoint,
# and expects a timeout/connection error.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

NAMESPACE="${NAMESPACE:-default}"
POD_NAME="metadata-test-$(date +%s)"
IMAGE="registry.access.redhat.com/ubi8/ubi:latest"
METADATA_URL="http://169.254.169.254"
TIMEOUT=10

cleanup() {
  log "Cleaning up test pod..."
  kubectl delete pod "$POD_NAME" -n "$NAMESPACE" --ignore-not-found 2>/dev/null
}
trap cleanup EXIT

verify_cluster

log "=== Metadata Endpoint Blocking Test ==="
log "Testing that pods cannot reach $METADATA_URL"
echo ""

# Create a temporary pod
log "Creating test pod '$POD_NAME' in namespace '$NAMESPACE'..."
kubectl run "$POD_NAME" -n "$NAMESPACE" --image="$IMAGE" --restart=Never --labels="user_app=true" \
  --overrides='{
    "spec": {
      "containers": [{
        "name": "'"$POD_NAME"'",
        "image": "'"$IMAGE"'",
        "args": ["sleep", "300"],
        "resources": {
          "requests": {"cpu": "50m", "memory": "64Mi"},
          "limits": {"cpu": "100m", "memory": "128Mi"}
        }
      }]
    }
  }'

log "Waiting for pod to be ready..."
kubectl wait --for=condition=Ready pod/"$POD_NAME" -n "$NAMESPACE" --timeout=120s
echo ""

# Attempt to reach the metadata endpoint
log "Attempting to reach metadata endpoint (expecting timeout/block)..."
CURL_OUTPUT=$(kubectl exec "$POD_NAME" -n "$NAMESPACE" -- \
  curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" \
  "$METADATA_URL" 2>/dev/null || true)
# Extract just the HTTP code (strip any kubectl error messages)
CURL_OUTPUT=$(echo "$CURL_OUTPUT" | grep -oE '^[0-9]{3}' || echo "000")

CURL_FULL=$(kubectl exec "$POD_NAME" -n "$NAMESPACE" -- \
  curl -s --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" \
  "$METADATA_URL" 2>&1 || true)

echo "  Response: $CURL_FULL"
echo ""

# Check the result
if echo "$CURL_FULL" | grep -qi "timeout\|connection refused\|no route\|exit code 28\|exit code 7"; then
  log "=== PASSED: Metadata endpoint is blocked ==="
  log "Pod cannot reach $METADATA_URL (as expected)."
  exit 0
elif [ "$CURL_OUTPUT" = "000" ]; then
  # HTTP code 000 means curl couldn't connect
  log "=== PASSED: Metadata endpoint is blocked ==="
  log "Pod cannot reach $METADATA_URL (connection failed, as expected)."
  exit 0
else
  fail "=== FAILED: Metadata endpoint is REACHABLE ==="
  fail "Pod was able to reach $METADATA_URL (HTTP $CURL_OUTPUT)"
  fail "Expected: connection timeout or refusal"
  fail "This means the egressDeny CiliumClusterwideNetworkPolicy is not effective."
  exit 1
fi
