#!/bin/bash
set -e

source "$(dirname "$0")/common.sh"

banner "Track 1: Tester Flow"

check_auth

# Step 1: Create 5 components (org-service, public-service, project-service, react-single-page-app, tester)
# Webapp is created here but its build is not waited on — tested at the end
run_step "tester_create" "Step 1/7: Create tester components" \
  npm run create:api:tester

# Step 2: Poll builds for services only (webapp build checked later in step 7)
run_step "tester_poll_builds" "Step 2/8: Poll builds" \
  npx tsx src/helpers/api-build-poller.ts "org-service,public-service,project-service,tester"

# Step 3: Create 3 connections (tester → org, public, project)
run_step "tester_connections" "Step 3/8: Create tester connections" \
  bash -c "cd '$VERIFY_ROOT' && npx playwright test --project=create-tester-connections"

# Step 4: Redeploy tester with connections
run_step "tester_deploy" "Step 4/8: Redeploy tester" \
  npx tsx src/helpers/api-redeployer.ts "tester"

# Step 5: Wait for tester deployment to become ACTIVE
run_step "tester_poll_deployment" "Step 5/8: Wait for deployment ACTIVE" \
  npx tsx src/helpers/api-deployment-poller.ts "tester"

# --- Steps 6–8: Run tests, report failures at the end ---
FAILURES=()

# Step 6: Run tester /test via API
step "Step 6/8: Run tester test"
if check_step_done "tester_test"; then
  log "Step 6/8: Run tester test — already done, skipping."
else
  if npx tsx src/helpers/api-test-runner.ts "tester" "/test"; then
    mark_step_done "tester_test"
    log "Step 6/8: Run tester test — done."
  else
    fail "Step 6/8: Run tester test — FAILED."
    FAILURES+=("tester /test")
  fi
fi

# Step 7: Test webapp (polls build + deployment + curls invokeUrl)
step "Step 7/8: Test webapp"
if check_step_done "tester_webapp"; then
  log "Step 7/8: Test webapp — already done, skipping."
else
  if npx tsx src/helpers/api-webapp-tester.ts; then
    mark_step_done "tester_webapp"
    log "Step 7/8: Test webapp — done."
  else
    fail "Step 7/8: Test webapp — FAILED."
    FAILURES+=("webapp")
  fi
fi

# Step 8: Observability APIs (metrics + logs) for tester component
step "Step 8/8: Observability APIs (metrics + logs)"
if check_step_done "tester_observability"; then
  log "Step 8/8: Observability — already done, skipping."
else
  if npx tsx src/helpers/api-observability-tester.ts "tester"; then
    mark_step_done "tester_observability"
    log "Step 8/8: Observability — done."
  else
    fail "Step 8/8: Observability — FAILED."
    FAILURES+=("observability")
  fi
fi

# --- Summary ---
echo ""
if [ ${#FAILURES[@]} -eq 0 ]; then
  banner "Track 1: Tester Flow — COMPLETE"
else
  echo -e "${RED}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}${BOLD}║       Track 1: Tester Flow — FAILURES                    ║${NC}"
  echo -e "${RED}${BOLD}╠══════════════════════════════════════════════════════════╣${NC}"
  for f in "${FAILURES[@]}"; do
    echo -e "${RED}║  ✗ ${f}${NC}"
  done
  echo -e "${RED}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""
  exit 1
fi
