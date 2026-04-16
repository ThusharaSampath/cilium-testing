#!/bin/bash
set -e

source "$(dirname "$0")/common.sh"

banner "Track 2: Service-to-Service Flow"

check_auth

# Step 1: Create server + client components
# Uses API-based creation with idempotency (skips existing components)
run_step "s2s_create" "Step 1/4: Create S2S components" \
  npm run create:api:s2s

# Step 2: Poll builds for server + client
run_step "s2s_poll_builds" "Step 2/4: Poll builds" \
  npx tsx src/helpers/api-build-poller.ts "server,client"

# Step 3: Create connection from client to server (via Playwright UI)
# The connection name and resourceRef are deterministic, so no manual steps needed
run_step "s2s_connection" "Step 3/4: Create connection" \
  bash -c "cd '$VERIFY_ROOT' && npx playwright test --project=create-connections"

# After connection, user must click "Deploy" in the UI
if ! check_step_done "s2s_deploy"; then
  echo ""
  echo -e "${YELLOW}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}${BOLD}║       DEPLOY CLIENT                                      ║${NC}"
  echo -e "${YELLOW}${BOLD}╠══════════════════════════════════════════════════════════╣${NC}"
  echo -e "${YELLOW}║                                                          ║${NC}"
  echo -e "${YELLOW}║  1. Go to Choreo console → client component              ║${NC}"
  echo -e "${YELLOW}║  2. Click \"Deploy\" to redeploy with the connection        ║${NC}"
  echo -e "${YELLOW}║  3. Wait for deployment to succeed                       ║${NC}"
  echo -e "${YELLOW}║                                                          ║${NC}"
  echo -e "${YELLOW}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"

  prompt_continue "Press Enter after deployment succeeds..."
  mark_step_done "s2s_deploy"
fi

# Step 4: Run S2S test via API
run_step "s2s_test" "Step 4/4: Run S2S test" \
  npx tsx src/helpers/api-test-runner.ts "client" "/"

banner "Track 2: Service-to-Service Flow — COMPLETE"
