#!/bin/bash
set -e

source "$(dirname "$0")/common.sh"

banner "Track 1: Tester Flow"

check_auth

# Step 1: Create 5 components (org-service, public-service, project-service, react-single-page-app, tester)
# Uses e2e-tester project which has built-in idempotency (skips existing components)
run_step "tester_create" "Step 1/6: Create tester components" \
  pw_run "e2e-tester"

# Step 2: Poll builds for all 5 components
run_step "tester_poll_builds" "Step 2/6: Poll builds" \
  env POLL_COMPONENTS="org-service,public-service,project-service,react-single-page-app,tester" \
  pw_run "poll-builds"

# Step 3: Collect endpoint URLs
run_step "tester_collect_urls" "Step 3/6: Collect endpoint URLs" \
  pw_run "collect-urls"

# Step 4: Update tester env config and trigger redeploy
run_step "tester_update_config" "Step 4/6: Update tester config" \
  pw_run "update-tester-config"

# Step 5: Poll tester redeploy
run_step "tester_poll_redeploy" "Step 5/6: Poll tester redeploy" \
  env POLL_COMPONENTS="tester" \
  pw_run "poll-builds"

# Step 6: Run tester /test via test console
run_step "tester_test" "Step 6/6: Run tester test" \
  pw_run "full-test" -g "Tester"

banner "Track 1: Tester Flow — COMPLETE"
