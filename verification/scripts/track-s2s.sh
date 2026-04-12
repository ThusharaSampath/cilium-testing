#!/bin/bash
set -e

source "$(dirname "$0")/common.sh"

banner "Track 2: Service-to-Service Flow"

check_auth

# Step 1: Create server + client components (with connection)
# Uses e2e-s2s project which has built-in idempotency (skips existing components)
run_step "s2s_create" "Step 1/5: Create S2S components" \
  pw_run "e2e-s2s"

# Step 2: Poll builds for server + client
run_step "s2s_poll_builds" "Step 2/5: Poll builds" \
  env POLL_COMPONENTS="project-level-server,project-level-client" \
  pw_run "poll-builds"

# Step 3: Manual step — user must update connection resourceRef
if ! check_step_done "s2s_manual"; then
  echo ""
  echo -e "${YELLOW}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}${BOLD}║       MANUAL STEPS REQUIRED                              ║${NC}"
  echo -e "${YELLOW}${BOLD}╠══════════════════════════════════════════════════════════╣${NC}"
  echo -e "${YELLOW}║                                                          ║${NC}"
  echo -e "${YELLOW}║  1. Go to Choreo console → project-level-client          ║${NC}"
  echo -e "${YELLOW}║     → Connections → copy the connection resourceRef      ║${NC}"
  echo -e "${YELLOW}║                                                          ║${NC}"
  echo -e "${YELLOW}║  2. Update the client's component.yaml:                  ║${NC}"
  echo -e "${YELLOW}║     service-to-service/project-level/client/             ║${NC}"
  echo -e "${YELLOW}║       .choreo/component.yaml                             ║${NC}"
  echo -e "${YELLOW}║     Update the resourceRef under connectionReferences    ║${NC}"
  echo -e "${YELLOW}║                                                          ║${NC}"
  echo -e "${YELLOW}║  3. Commit and push:                                     ║${NC}"
  echo -e "${YELLOW}║     git add . && git commit -m 'update s2s ref' && push  ║${NC}"
  echo -e "${YELLOW}║                                                          ║${NC}"
  echo -e "${YELLOW}║  4. Rebuild the client component in Choreo               ║${NC}"
  echo -e "${YELLOW}║                                                          ║${NC}"
  echo -e "${YELLOW}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"

  prompt_continue "Press Enter after completing the manual steps above..."
  mark_step_done "s2s_manual"
fi

# Step 4: Poll client rebuild
run_step "s2s_poll_rebuild" "Step 4/5: Poll client rebuild" \
  env POLL_COMPONENTS="project-level-client" \
  pw_run "poll-builds"

# Step 5: Run S2S test via test console
run_step "s2s_test" "Step 5/5: Run S2S test" \
  pw_run "full-test" -g "S2S"

banner "Track 2: Service-to-Service Flow — COMPLETE"
