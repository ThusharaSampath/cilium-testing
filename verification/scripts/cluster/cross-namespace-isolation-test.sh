#!/bin/bash
set -e

# Cross-Namespace Isolation Test
# Creates two test namespaces (cilium-xns-test-a, cilium-xns-test-b) each with
# the `choreo-default-policies` CNP that restricts ingress to the same namespace.
# Places a client pod in ns-a and a server pod in ns-b, then attempts to reach
# the server from the client by:
#   - pod IP         (http://<pod-ip>:8080/)
#   - service DNS    (http://xns-server.cilium-xns-test-b.svc:8080/)
# Both calls must fail (timeout / connection refused) for the test to pass.
# Control: the same server is also reached from within ns-b — that must succeed.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
YAML_FILE="$REPO_ROOT/cross-namespace-isolation-test.yaml"
NS_A="cilium-xns-test-a"
NS_B="cilium-xns-test-b"
CURL_TIMEOUT="${CURL_TIMEOUT:-5}"

cleanup() {
  log "Cleaning up test resources..."
  kubectl delete -f "$YAML_FILE" --ignore-not-found --wait=false 2>/dev/null || true
  log "Cleanup submitted (namespaces will finalize in background)."
}

verify_cluster

# Remove any leftovers from a prior run
kubectl delete -f "$YAML_FILE" --ignore-not-found --wait=false 2>/dev/null || true
sleep 2

log "Applying cross-namespace isolation test manifest..."
kubectl apply -f "$YAML_FILE" --validate=false

log "Waiting for pods to become Ready..."
kubectl wait --for=condition=Ready pod/xns-client -n "$NS_A" --timeout=120s
kubectl wait --for=condition=Ready pod/xns-server -n "$NS_B" --timeout=120s

# Capture server pod IP
SERVER_IP=$(kubectl get pod xns-server -n "$NS_B" -o jsonpath='{.status.podIP}')
if [ -z "$SERVER_IP" ]; then
  fail "Could not determine xns-server pod IP."
  cleanup
  exit 1
fi
log "Server pod IP: $SERVER_IP"

# curl returns empty body + 000 on network failure; we capture exit code too.
# --max-time enforces hard timeout. -sS shows errors but suppresses progress.
run_curl() {
  local target="$1"
  kubectl exec -n "$NS_A" xns-client -- \
    curl -sS -o /dev/null -w "%{http_code}" --max-time "$CURL_TIMEOUT" "$target" 2>&1 || true
}

echo ""
log "=== Test 1: cross-namespace call by pod IP (expect BLOCKED) ==="
OUT_IP=$(run_curl "http://$SERVER_IP:8080/")
log "Result: $OUT_IP"

echo ""
log "=== Test 2: cross-namespace call by service DNS (expect BLOCKED) ==="
OUT_DNS=$(run_curl "http://xns-server.$NS_B.svc:8080/")
log "Result: $OUT_DNS"

echo ""
log "=== Test 3: same-namespace control call (expect 200) ==="
# Spin up an ephemeral client inside ns-b to confirm the server itself is healthy.
OUT_CTRL=$(kubectl run xns-ctrl-probe -n "$NS_B" --rm -i --restart=Never --quiet \
  --image=registry.access.redhat.com/ubi8/ubi:latest -- \
  curl -sS -o /dev/null -w "%{http_code}" --max-time "$CURL_TIMEOUT" "http://$SERVER_IP:8080/" 2>&1 || true)
log "Result: $OUT_CTRL"

echo ""
log "=== Summary ==="
# A blocked call will surface as a non-2xx result (usually "000" + curl error, or exit 28 timeout).
# We treat anything other than a 2xx HTTP code as "blocked".
is_blocked() {
  local r="$1"
  # Extract the final HTTP code if any was captured; default empty means no response.
  case "$r" in
    *200*|*201*|*204*|*301*|*302*|*401*|*403*|*404*) return 1 ;;
    *) return 0 ;;
  esac
}

PASS=true

if is_blocked "$OUT_IP"; then
  log "[PASS] pod-IP cross-namespace call was blocked ($OUT_IP)"
else
  fail "[FAIL] pod-IP cross-namespace call succeeded — isolation broken ($OUT_IP)"
  PASS=false
fi

if is_blocked "$OUT_DNS"; then
  log "[PASS] service-DNS cross-namespace call was blocked ($OUT_DNS)"
else
  fail "[FAIL] service-DNS cross-namespace call succeeded — isolation broken ($OUT_DNS)"
  PASS=false
fi

if echo "$OUT_CTRL" | grep -qE '^[[:space:]]*200'; then
  log "[PASS] same-namespace control call succeeded (200)"
else
  warn "[WARN] same-namespace control call did not return 200 ($OUT_CTRL)"
  warn "       Server may not be healthy; cross-namespace results above may be unreliable."
  PASS=false
fi

echo ""
if [ "$PASS" = true ]; then
  log "=== PASSED: Cross-namespace isolation is enforced ==="
  cleanup
  exit 0
else
  fail "=== FAILED: Cross-namespace isolation test ==="
  fail "Resources left in place for debugging. Run 'kubectl delete -f $YAML_FILE' to clean up."
  exit 1
fi
