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

# --- Check DNS pods health ---
# OpenShift uses openshift-dns namespace with different labels; AKS uses kube-system with k8s-app=kube-dns
if [ "$CLUSTER" = "OS" ]; then
  DNS_NAMESPACE="openshift-dns"
  DNS_LABEL="dns.operator.openshift.io/daemonset-dns=default"
  DNS_SERVICE_DOMAIN="dns-default.openshift-dns.svc.cluster.local"
  DNS_LABEL_NAME="OpenShift DNS"
else
  DNS_NAMESPACE="kube-system"
  DNS_LABEL="k8s-app=kube-dns"
  DNS_SERVICE_DOMAIN="kube-dns.kube-system.svc.cluster.local"
  DNS_LABEL_NAME="CoreDNS"
fi

log "Checking $DNS_LABEL_NAME pod status in $DNS_NAMESPACE..."
COREDNS_PODS=$(kubectl get pods -n "$DNS_NAMESPACE" -l "$DNS_LABEL" --no-headers 2>/dev/null)

if [ -z "$COREDNS_PODS" ]; then
  fail "No $DNS_LABEL_NAME pods found in $DNS_NAMESPACE namespace."
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
  fail "Not all $DNS_LABEL_NAME pods are healthy."
  exit 1
fi
log "All $DNS_LABEL_NAME pods are healthy."
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

run_dns_test "$DNS_LABEL_NAME service" \
  "$DNS_SERVICE_DOMAIN"

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
  log "=== PASSED: $DNS_LABEL_NAME connectivity test ($PASS/$TOTAL) ==="
  exit 0
else
  FAILED=$((TOTAL - PASS))
  fail "=== FAILED: $DNS_LABEL_NAME connectivity test ($PASS/$TOTAL passed, $FAILED failed) ==="
  exit 1
fi
