#!/bin/bash
set -e

source "$(dirname "$0")/common.sh"

banner "Track 2: Service-to-Service Flow"

check_auth

# Step 1: Create server + client components
# Uses API-based creation with idempotency (skips existing components)
run_step "s2s_create" "Step 1/6: Create S2S components" \
  npm run create:api:s2s

# Step 2: Poll builds for server + client
run_step "s2s_poll_builds" "Step 2/6: Poll builds" \
  npx tsx src/helpers/api-build-poller.ts "server,client"

# Step 3: Create connection from client to server (via API)
run_step "s2s_connection" "Step 3/6: Create connection" \
  npx tsx src/helpers/api-connection-creator.ts s2s

# Step 4: Redeploy client with connection
run_step "s2s_deploy" "Step 4/6: Redeploy client" \
  npx tsx src/helpers/api-redeployer.ts "client"

# Step 5: Wait for client deployment to become ACTIVE
run_step "s2s_poll_deployment" "Step 5/6: Wait for deployment ACTIVE" \
  npx tsx src/helpers/api-deployment-poller.ts "client"

# Step 6: Run S2S test via API
run_step "s2s_test" "Step 6/6: Run S2S test" \
  npx tsx src/helpers/api-test-runner.ts "client" "/"

banner "Track 2: Service-to-Service Flow — COMPLETE"
