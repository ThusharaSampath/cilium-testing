#!/bin/bash
set -e

source "$(dirname "$0")/common.sh"

CLUSTER_SCRIPTS="$SCRIPT_DIR/cluster"

banner "Track 3: Infrastructure Tests"

# Source cluster common.sh to set up HTTPS_PROXY / KUBECONFIG
source "$CLUSTER_SCRIPTS/common.sh"

# Verify cluster connectivity once before running tests
verify_cluster

# Step 1: Cluster info
run_step "infra_cluster_info" "Step 1/5: Cluster info" \
  bash "$CLUSTER_SCRIPTS/cluster-info.sh"

# Step 2: CoreDNS connectivity
run_step "infra_coredns" "Step 2/5: CoreDNS connectivity" \
  bash "$CLUSTER_SCRIPTS/coredns-test.sh"

# Step 3: Transparent encryption (WireGuard)
run_step "infra_encryption" "Step 3/5: Transparent encryption" \
  bash "$CLUSTER_SCRIPTS/transparent-encryption-test.sh"

# Step 4: Hubble observability (CLI + Prometheus)
run_step "infra_hubble" "Step 4/5: Hubble observability" \
  bash "$CLUSTER_SCRIPTS/hubble-observability-test.sh"

# Step 5: Cross-node communication (longest — ~5 min)
run_step "infra_cross_node" "Step 5/5: Cross-node communication" \
  bash "$CLUSTER_SCRIPTS/cross-node-test.sh"

# Optional: Gateway error monitor (~10 min)
if ! check_step_done "infra_gateway"; then
  echo ""
  echo -n "Run gateway error monitor? (~10 min) [y/N]: "
  read -r run_gateway
  if [ "$run_gateway" = "y" ] || [ "$run_gateway" = "Y" ]; then
    run_step "infra_gateway" "Optional: Gateway error monitor" \
      bash "$CLUSTER_SCRIPTS/gateway-error-monitor.sh"
  else
    info "Skipping gateway error monitor."
    mark_step_done "infra_gateway"
  fi
fi

banner "Track 3: Infrastructure Tests — COMPLETE"
