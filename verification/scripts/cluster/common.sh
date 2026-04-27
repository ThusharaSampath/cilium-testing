#!/bin/bash
# Common utilities for cluster test scripts.
# Source this file from other scripts: source "$(dirname "$0")/common.sh"
#
# Prerequisite: the shell running these scripts must already have kubectl
# configured to reach the target PDP cluster. The script does NOT set up
# KUBECONFIG, proxies, or SSH tunnels — that is the operator's responsibility.
# Examples of valid setups:
#   - export KUBECONFIG=/path/to/kubeconfig
#   - export HTTPS_PROXY=http://localhost:<port>   (for clusters behind a tunnel)
#   - oc login ...                                 (OpenShift)
#
# Per-cluster overrides (e.g. CILIUM_NS, DNS_NAMESPACE, APIM_NS) can be set
# in verification/.env as plain KEY=VALUE lines — they are auto-loaded below.

# Auto-load verification/.env if present so cluster scripts pick up overrides
# (CILIUM_NS, DNS_NAMESPACE, DNS_LABEL, APIM_NS, etc.) without manual export.
_COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_VERIFY_ENV_FILE="$_COMMON_DIR/../../.env"
if [ -f "$_VERIFY_ENV_FILE" ]; then
  # Read line-by-line so we tolerate values with spaces/special chars.
  # Only KEY=VALUE lines are picked up; comments and blanks are skipped.
  # Values are exported only when the variable is not already set in the
  # environment, so explicit shell exports always win.
  while IFS= read -r _line || [ -n "$_line" ]; do
    case "$_line" in
      ''|\#*) continue ;;
    esac
    if [[ "$_line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      _key="${BASH_REMATCH[1]}"
      _val="${BASH_REMATCH[2]}"
      # Strip surrounding single or double quotes from the value, if any.
      if [[ "$_val" =~ ^\"(.*)\"$ ]] || [[ "$_val" =~ ^\'(.*)\'$ ]]; then
        _val="${BASH_REMATCH[1]}"
      fi
      if [ -z "${!_key+x}" ]; then
        export "$_key=$_val"
      fi
    fi
  done < "$_VERIFY_ENV_FILE"
  unset _line _key _val
fi
unset _COMMON_DIR _VERIFY_ENV_FILE

# Cilium namespace — override via env or verification/.env if your cluster
# installs Cilium elsewhere (e.g. CILIUM_NS=cilium on OpenShift).
CILIUM_NS="${CILIUM_NS:-kube-system}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }

# Verify kubectl connectivity against whatever cluster the current shell targets.
verify_cluster() {
  log "Verifying cluster connectivity..."
  if ! kubectl cluster-info > /dev/null 2>&1; then
    fail "Cannot connect to cluster."
    fail "Ensure kubectl is configured to reach the target PDP cluster."
    fail "  - Check 'kubectl config current-context'"
    fail "  - For private clusters, ensure your tunnel/proxy is up and HTTPS_PROXY is exported"
    fail "  - For OpenShift, ensure you're logged in (oc login ...)"
    exit 1
  fi
  local ctx
  ctx=$(kubectl config current-context 2>/dev/null || echo "unknown")
  log "Connected to cluster (context: $ctx)"
}
