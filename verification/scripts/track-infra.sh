#!/bin/bash
set -e

source "$(dirname "$0")/common.sh"

CLUSTER_SCRIPTS="$SCRIPT_DIR/cluster"

banner "Track 3: Infrastructure Tests"

# Source cluster common.sh for shared logging + verify_cluster.
# Cluster access (KUBECONFIG, proxy, oc login, etc.) is the operator's responsibility.
source "$CLUSTER_SCRIPTS/common.sh"

# Verify cluster connectivity once before running tests
verify_cluster

FAILURES=()

# Step 1: Cluster info
run_step_soft "infra_cluster_info" "Step 1/7: Cluster info" \
  bash "$CLUSTER_SCRIPTS/cluster-info.sh"

# Step 2: CoreDNS connectivity
run_step_soft "infra_coredns" "Step 2/7: CoreDNS connectivity" \
  bash "$CLUSTER_SCRIPTS/coredns-test.sh"

# Step 3: Transparent encryption (WireGuard)
run_step_soft "infra_encryption" "Step 3/7: Transparent encryption" \
  bash "$CLUSTER_SCRIPTS/transparent-encryption-test.sh"

# Step 4: Hubble observability (CLI + Prometheus)
run_step_soft "infra_hubble" "Step 4/7: Hubble observability" \
  bash "$CLUSTER_SCRIPTS/hubble-observability-test.sh"

# Step 5: Metadata endpoint blocking
run_step_soft "infra_metadata" "Step 5/7: Metadata endpoint blocking" \
  bash "$CLUSTER_SCRIPTS/metadata-endpoint-test.sh"

# Step 6: Cross-namespace isolation
run_step_soft "infra_cross_namespace" "Step 6/7: Cross-namespace isolation" \
  bash "$CLUSTER_SCRIPTS/cross-namespace-isolation-test.sh"

# Step 7: Cross-node communication (longest — ~5 min)
run_step_soft "infra_cross_node" "Step 7/7: Cross-node communication" \
  bash "$CLUSTER_SCRIPTS/cross-node-test.sh"

# Optional: Gateway error monitor (~10 min)
if ! check_step_done "infra_gateway"; then
  echo ""
  echo -n "Run gateway error monitor? (~10 min) [y/N]: "
  read -r run_gateway
  if [ "$run_gateway" = "y" ] || [ "$run_gateway" = "Y" ]; then
    run_step_soft "infra_gateway" "Optional: Gateway error monitor" \
      bash "$CLUSTER_SCRIPTS/gateway-error-monitor.sh"
  else
    info "Skipping gateway error monitor."
    mark_step_done "infra_gateway"
  fi
fi

# --- Summary ---
echo ""
if [ ${#FAILURES[@]} -eq 0 ]; then
  banner "Track 3: Infrastructure Tests — COMPLETE"
else
  echo -e "${RED}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}${BOLD}║       Track 3: Infrastructure Tests — FAILURES           ║${NC}"
  echo -e "${RED}${BOLD}╠══════════════════════════════════════════════════════════╣${NC}"
  for f in "${FAILURES[@]}"; do
    echo -e "${RED}║  ✗ ${f}${NC}"
  done
  echo -e "${RED}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  exit 1
fi
