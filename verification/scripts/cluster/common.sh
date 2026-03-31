#!/bin/bash
# Common configuration for cluster test scripts.
# Source this file from other scripts: source "$(dirname "$0")/common.sh"

# Proxy for reaching the private AKS API server via SSH tunnel
# Set HTTPS_PROXY before running, or the default tunnel address is used.
export HTTPS_PROXY="${HTTPS_PROXY:-http://localhost:3129}"

# AKS cluster config
AKS_RG="${AKS_RG:-choreo-dev-dataplane-002-aks-rg}"
AKS_CLUSTER="${AKS_CLUSTER:-choreo-dev-dataplane-aks-cluster-002}"
CILIUM_NS="${CILIUM_NS:-kube-system}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }

# Verify kubectl connectivity through the proxy
verify_cluster() {
  log "Verifying cluster connectivity (HTTPS_PROXY=$HTTPS_PROXY)..."
  if ! kubectl cluster-info > /dev/null 2>&1; then
    fail "Cannot connect to cluster."
    fail "Make sure the SSH tunnel is running and HTTPS_PROXY is set correctly."
    fail "  1. Run: sh ssh-tunnel-dev-dp.sh <username>"
    fail "  2. Export: export HTTPS_PROXY=http://localhost:3129"
    exit 1
  fi
  log "Connected to cluster."
}
