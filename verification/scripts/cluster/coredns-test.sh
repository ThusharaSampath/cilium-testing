#!/bin/bash
set -e

# CoreDNS Connectivity Test
# Spins up a temporary busybox pod and runs DNS resolution tests
# to verify CoreDNS is functioning correctly in the cluster.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

NAMESPACE="${NAMESPACE:-default}"
POD_NAME="dns-test-$(date +%s)"
IMAGE="busybox:1.36"
TIMEOUT=60

cleanup() {
  log "Cleaning up test pod..."
  kubectl delete pod "$POD_NAME" -n "$NAMESPACE" --ignore-not-found 2>/dev/null
}
trap cleanup EXIT

verify_cluster

# --- Check CoreDNS pods health ---
log "Checking CoreDNS pod status..."
COREDNS_PODS=$(kubectl get pods -n kube-system -l k8s-app=kube-dns --no-headers 2>/dev/null)

if [ -z "$COREDNS_PODS" ]; then
  fail "No CoreDNS pods found in kube-system namespace."
  exit 1
fi

ALL_RUNNING=true
while read -r line; do
  POD=$(echo "$line" | awk '{print $1}')
  STATUS=$(echo "$line" | awk '{print $3}')
  RESTARTS=$(echo "$line" | awk '{print $4}')
  if [ "$STATUS" != "Running" ]; then
    fail "  $POD is $STATUS (restarts: $RESTARTS)"
    ALL_RUNNING=false
  else
    log "  $POD is Running (restarts: $RESTARTS)"
  fi
done <<< "$COREDNS_PODS"

if [ "$ALL_RUNNING" = false ]; then
  fail "Not all CoreDNS pods are healthy."
  exit 1
fi
log "All CoreDNS pods are healthy."
echo ""

# --- Spin up debug pod ---
log "Creating debug pod '$POD_NAME' in namespace '$NAMESPACE'..."
kubectl run "$POD_NAME" -n "$NAMESPACE" --image="$IMAGE" --restart=Never -- sleep 300

log "Waiting for pod to be ready..."
kubectl wait --for=condition=Ready pod/"$POD_NAME" -n "$NAMESPACE" --timeout="${TIMEOUT}s"
echo ""

# --- DNS Tests ---
PASS=0
TOTAL=0

run_dns_test() {
  local description="$1"
  local domain="$2"
  TOTAL=$((TOTAL + 1))

  log "Test $TOTAL: $description ($domain)"
  if OUTPUT=$(kubectl exec "$POD_NAME" -n "$NAMESPACE" -- nslookup "$domain" 2>&1); then
    echo "$OUTPUT" | sed 's/^/  /'
    log "  -> PASSED"
    PASS=$((PASS + 1))
  else
    echo "$OUTPUT" | sed 's/^/  /'
    fail "  -> FAILED"
  fi
  echo ""
}

run_dns_test "Kubernetes API service" \
  "kubernetes.default.svc.cluster.local"

run_dns_test "CoreDNS service" \
  "kube-dns.kube-system.svc.cluster.local"

run_dns_test "External domain resolution" \
  "google.com"

# Test Cilium-related services if present
if kubectl get svc -n kube-system hubble-relay --no-headers 2>/dev/null | grep -q hubble-relay; then
  run_dns_test "Hubble Relay service" \
    "hubble-relay.kube-system.svc.cluster.local"
fi

# --- Results ---
echo ""
if [ "$PASS" -eq "$TOTAL" ]; then
  log "=== PASSED: CoreDNS connectivity test ($PASS/$TOTAL) ==="
  exit 0
else
  FAILED=$((TOTAL - PASS))
  fail "=== FAILED: CoreDNS connectivity test ($PASS/$TOTAL passed, $FAILED failed) ==="
  exit 1
fi
