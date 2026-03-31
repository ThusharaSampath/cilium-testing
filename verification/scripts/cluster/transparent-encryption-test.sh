#!/bin/bash
set -e

# Transparent Encryption (WireGuard) Validation
# Based on: https://docs.cilium.io/en/v1.14/security/network/encryption-wireguard/#validate-the-setup
#
# Checks:
# 1. Cilium has encryption enabled (WireGuard)
# 2. WireGuard interfaces are present on nodes
# 3. Peers are established between nodes

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

OVERALL_RESULT=0

verify_cluster

# Get a Cilium agent pod
CILIUM_POD=$(kubectl -n "$CILIUM_NS" get pods -l k8s-app=cilium -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -z "$CILIUM_POD" ]; then
  fail "No Cilium agent pod found in namespace '$CILIUM_NS'."
  exit 1
fi

log "Using Cilium agent pod: $CILIUM_POD"

# --- Test 1: Check Cilium encryption status ---
echo ""
log "=== Test 1: Cilium encryption status ==="

ENCRYPTION_STATUS=$(kubectl -n "$CILIUM_NS" exec "$CILIUM_POD" -c cilium-agent -- \
  cilium status 2>/dev/null | grep -i "encryption" || true)

if [ -z "$ENCRYPTION_STATUS" ]; then
  fail "Could not determine encryption status from cilium status."
  OVERALL_RESULT=1
else
  echo "  $ENCRYPTION_STATUS"
  if echo "$ENCRYPTION_STATUS" | grep -qi "wireguard"; then
    log "WireGuard encryption is enabled."
  elif echo "$ENCRYPTION_STATUS" | grep -qi "ipsec"; then
    log "IPsec encryption is enabled."
  elif echo "$ENCRYPTION_STATUS" | grep -qi "disabled"; then
    fail "Encryption is DISABLED."
    OVERALL_RESULT=1
  else
    warn "Encryption status unclear. Please verify manually."
  fi
fi

# --- Test 2: Check WireGuard interface ---
echo ""
log "=== Test 2: WireGuard interface on Cilium pod ==="

WG_STATUS=$(kubectl -n "$CILIUM_NS" exec "$CILIUM_POD" -c cilium-agent -- \
  cilium encrypt status 2>/dev/null || true)

if [ -z "$WG_STATUS" ]; then
  fail "Could not get encryption details."
  OVERALL_RESULT=1
else
  echo "$WG_STATUS" | sed 's/^/  /'

  # Check for peers
  PEER_COUNT=$(echo "$WG_STATUS" | grep -c "peer" || true)
  NODE_COUNT=$(kubectl get nodes --no-headers | wc -l | tr -d ' ')
  EXPECTED_PEERS=$(( NODE_COUNT - 1 ))

  echo ""
  log "Cluster nodes: $NODE_COUNT"
  log "Expected WireGuard peers per node: $EXPECTED_PEERS"
  log "Detected peer references: $PEER_COUNT"
fi

# --- Test 3: Verify on multiple nodes ---
echo ""
log "=== Test 3: Checking encryption across all Cilium agents ==="

ALL_CILIUM_PODS=$(kubectl -n "$CILIUM_NS" get pods -l k8s-app=cilium -o jsonpath='{.items[*].metadata.name}')
CHECKED=0
FAILED_NODES=0

for pod in $ALL_CILIUM_PODS; do
  NODE=$(kubectl -n "$CILIUM_NS" get pod "$pod" -o jsonpath='{.spec.nodeName}')
  ENC=$(kubectl -n "$CILIUM_NS" exec "$pod" -c cilium-agent -- \
    cilium encrypt status 2>/dev/null | head -1 || echo "ERROR")

  if echo "$ENC" | grep -qi "error\|disabled"; then
    fail "  Node $NODE ($pod): $ENC"
    FAILED_NODES=$(( FAILED_NODES + 1 ))
  else
    log "  Node $NODE ($pod): $ENC"
  fi
  CHECKED=$(( CHECKED + 1 ))
done

echo ""
log "Checked $CHECKED Cilium agents. Failed: $FAILED_NODES"

if [ "$FAILED_NODES" -gt 0 ]; then
  OVERALL_RESULT=1
fi

# --- Summary ---
echo ""
if [ "$OVERALL_RESULT" -eq 0 ]; then
  log "=== PASSED: Transparent encryption test ==="
else
  fail "=== FAILED: Some encryption checks failed ==="
fi

exit $OVERALL_RESULT
