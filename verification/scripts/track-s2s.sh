#!/bin/bash
set -e

source "$(dirname "$0")/common.sh"

banner "Track 2: Service-to-Service Flow"

check_auth

# Step 1: Create server + client components
# Uses API-based creation with idempotency (skips existing components)
run_step "s2s_create" "Step 1/5: Create S2S components" \
  npm run create:api:s2s

# Step 2: Poll builds for server + client
run_step "s2s_poll_builds" "Step 2/5: Poll builds" \
  npx tsx src/helpers/api-build-poller.ts "server,client"

# Step 3: Create connection from client to server (via Playwright UI)
# The connection name and resourceRef are deterministic, so no manual steps needed
run_step "s2s_connection" "Step 3/5: Create connection" \
  bash -c "cd '$VERIFY_ROOT' && npx playwright test --project=create-connections"

# Step 4: Redeploy client with connection
run_step "s2s_deploy" "Step 4/5: Redeploy client" \
  npx tsx src/helpers/api-redeployer.ts "client"

# Step 5: Run S2S test via API
run_step "s2s_test" "Step 5/5: Run S2S test" \
  npx tsx src/helpers/api-test-runner.ts "client" "/"

banner "Track 2: Service-to-Service Flow — COMPLETE"
