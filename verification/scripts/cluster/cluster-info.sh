#!/bin/bash
set -e

# Cluster Info Script
# Displays Kubernetes version, Cilium version, and platform info (OpenShift/EKS/AKS/GKE/vanilla).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

verify_cluster

echo ""
log "========================================="
log "         Cluster Information"
log "========================================="
echo ""

# --- Kubernetes Version ---
log "Kubernetes Version:"
VERSION_JSON=$(kubectl version -o json 2>/dev/null)
SERVER_VERSION=$(echo "$VERSION_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('serverVersion',{}).get('gitVersion',''))" 2>/dev/null)
if [ -n "$SERVER_VERSION" ]; then
  echo "  Server: $SERVER_VERSION"
else
  warn "  Could not determine server version"
fi

CLIENT_VERSION=$(echo "$VERSION_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('clientVersion',{}).get('gitVersion',''))" 2>/dev/null)
if [ -n "$CLIENT_VERSION" ]; then
  echo "  Client (kubectl): $CLIENT_VERSION"
fi
echo ""

# --- Platform Detection ---
log "Platform:"
PLATFORM="Vanilla Kubernetes"

# Check OpenShift
if kubectl get clusterversion &>/dev/null; then
  OCP_VERSION=$(kubectl get clusterversion -o jsonpath='{.items[0].status.desired.version}' 2>/dev/null)
  if [ -n "$OCP_VERSION" ]; then
    PLATFORM="OpenShift $OCP_VERSION"
  fi
# Check EKS
elif kubectl get nodes -o jsonpath='{.items[0].spec.providerID}' 2>/dev/null | grep -q "aws"; then
  EKS_PLATFORM=$(kubectl get nodes -o jsonpath='{.items[0].metadata.labels.eks\.amazonaws\.com/nodegroup}' 2>/dev/null)
  if [ -n "$EKS_PLATFORM" ]; then
    PLATFORM="AWS EKS (nodegroup: $EKS_PLATFORM)"
  else
    PLATFORM="AWS EKS"
  fi
# Check AKS
elif kubectl get nodes -o jsonpath='{.items[0].spec.providerID}' 2>/dev/null | grep -q "azure"; then
  PLATFORM="Azure AKS"
# Check GKE
elif kubectl get nodes -o jsonpath='{.items[0].spec.providerID}' 2>/dev/null | grep -q "gce"; then
  PLATFORM="Google GKE"
fi

echo "  $PLATFORM"
echo ""

# --- Cilium Version ---
log "Cilium Version:"

# Try common namespaces for Cilium
CILIUM_POD=""
CILIUM_FOUND_NS=""
for ns in "$CILIUM_NS" cilium kube-system; do
  CILIUM_POD=$(kubectl get pods -n "$ns" -l app.kubernetes.io/name=cilium-agent -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
  if [ -z "$CILIUM_POD" ]; then
    # Fallback: look for pods from the cilium daemonset
    CILIUM_POD=$(kubectl get pods -n "$ns" -l k8s-app=cilium -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
  fi
  if [ -n "$CILIUM_POD" ]; then
    CILIUM_FOUND_NS="$ns"
    break
  fi
done

if [ -n "$CILIUM_POD" ]; then
  CILIUM_VERSION=$(kubectl exec -n "$CILIUM_FOUND_NS" "$CILIUM_POD" -- cilium version 2>/dev/null | head -2 || true)
  if [ -n "$CILIUM_VERSION" ]; then
    echo "$CILIUM_VERSION" | sed 's/^/  /'
  else
    # Fallback: get version from container image
    IMAGE=$(kubectl get pod -n "$CILIUM_FOUND_NS" "$CILIUM_POD" -o jsonpath='{.spec.containers[0].image}' 2>/dev/null || true)
    echo "  Image: $IMAGE"
  fi
  echo "  Namespace: $CILIUM_FOUND_NS"
else
  warn "  Cilium agent not found in any namespace"
fi

echo ""
log "========================================="
