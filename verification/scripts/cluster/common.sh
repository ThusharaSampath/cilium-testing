#!/bin/bash
# Common configuration for cluster test scripts.
# Source this file from other scripts: source "$(dirname "$0")/common.sh"
#
# Supports two clusters controlled by CLUSTER in .env:
#   CLUSTER=DEV  — AKS dev cluster, reached via SSH tunnel proxy (HTTPS_PROXY)
#   CLUSTER=OS   — OpenShift cluster on AWS, reached via KUBECONFIG

SCRIPT_DIR_COMMON="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR_COMMON/../../.env"
REPO_ROOT="$(cd "$SCRIPT_DIR_COMMON/../../.." && pwd)"

# Load CLUSTER from .env (default: DEV)
if [ -f "$ENV_FILE" ]; then
  CLUSTER=$(grep '^CLUSTER=' "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]')
fi
CLUSTER="${CLUSTER:-DEV}"

if [ "$CLUSTER" = "OS" ]; then
  # OpenShift cluster — use kubeconfig, no proxy
  export KUBECONFIG="${KUBECONFIG:-$REPO_ROOT/kubeconfig}"
  unset HTTPS_PROXY
  unset HTTP_PROXY
  CILIUM_NS="${CILIUM_NS:-cilium}"
  CLUSTER_LABEL="OpenShift (OS)"
else
  # AKS dev cluster — use SSH tunnel proxy
  export HTTPS_PROXY="${HTTPS_PROXY:-http://localhost:3129}"
  CILIUM_NS="${CILIUM_NS:-kube-system}"
  CLUSTER_LABEL="AKS Dev (DEV)"
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }

# Verify kubectl connectivity
verify_cluster() {
  log "Target cluster: $CLUSTER_LABEL"
  if [ "$CLUSTER" = "OS" ]; then
    log "Using KUBECONFIG=$KUBECONFIG"
  else
    log "Using HTTPS_PROXY=$HTTPS_PROXY"
  fi
  log "Verifying cluster connectivity..."
  if ! kubectl cluster-info > /dev/null 2>&1; then
    fail "Cannot connect to cluster."
    if [ "$CLUSTER" = "OS" ]; then
      fail "Check that KUBECONFIG is correct: $KUBECONFIG"
    else
      fail "Make sure the SSH tunnel is running and HTTPS_PROXY is set correctly."
      fail "  1. Run: sh ssh-tunnel-dev-dp.sh <username>"
      fail "  2. Export: export HTTPS_PROXY=http://localhost:3129"
    fi
    exit 1
  fi
  log "Connected to cluster."
}
