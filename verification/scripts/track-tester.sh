#!/bin/bash
set -e

source "$(dirname "$0")/common.sh"

banner "Track 1: Tester Flow"

check_auth

# Step 1: Create 5 components (org-service, public-service, project-service, react-single-page-app, tester)
# Uses API-based creation with idempotency (skips existing components)
run_step "tester_create" "Step 1/6: Create tester components" \
  npm run create:api:tester

# Step 2: Poll builds for all 5 components
run_step "tester_poll_builds" "Step 2/6: Poll builds" \
  npx tsx src/helpers/api-build-poller.ts "org-service,public-service,project-service,react-single-page-app,tester"

# Step 3: Collect endpoint URLs
run_step "tester_collect_urls" "Step 3/6: Collect endpoint URLs" \
  pw_run "collect-urls"

# Step 4: Update tester env config and trigger redeploy
run_step "tester_update_config" "Step 4/6: Update tester config" \
  pw_run "update-tester-config"

# Step 5: Poll tester redeploy
run_step "tester_poll_redeploy" "Step 5/6: Poll tester redeploy" \
  npx tsx src/helpers/api-build-poller.ts "tester"

# Step 6: Run tester /test via API
run_step "tester_test" "Step 6/6: Run tester test" \
  npx tsx src/helpers/api-test-runner.ts "tester" "/test"

banner "Track 1: Tester Flow — COMPLETE"
