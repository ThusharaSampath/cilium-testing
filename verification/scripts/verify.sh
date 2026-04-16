#!/bin/bash
set -e

source "$(dirname "$0")/common.sh"

# Handle --reset flag
if [ "$1" = "--reset" ]; then
  clear_state
  info "Run this script again without --reset to start fresh."
  exit 0
fi

banner "Cilium Verification Toolbox"

# Track selection
echo "Select which tracks to run:"
echo ""
echo "  1) All tracks (Tester + S2S + Infra)"
echo "  2) Tester track only"
echo "  3) Service-to-Service track only"
echo "  4) Infrastructure track only"
echo ""
echo -n "Choice [1]: "
read -r choice
choice="${choice:-1}"

case "$choice" in
  1)
    info "Running all tracks."
    echo ""

    # Infra first — validates cluster foundation
    bash "$SCRIPT_DIR/track-infra.sh"

    # UI tracks after infra passes
    check_auth

    bash "$SCRIPT_DIR/track-tester.sh"
    bash "$SCRIPT_DIR/track-s2s.sh"

    # Run combined full-test for final report
    step "Final: Combined UI verification report"
    pw_run "full-test" || true

    banner "ALL TRACKS COMPLETE"
    ;;
  2)
    check_auth
    info "Running tester track only."
    bash "$SCRIPT_DIR/track-tester.sh"
    ;;
  3)
    check_auth
    info "Running S2S track only."
    bash "$SCRIPT_DIR/track-s2s.sh"
    ;;
  4)
    info "Running infra track only."
    bash "$SCRIPT_DIR/track-infra.sh"
    ;;
  *)
    fail "Invalid choice: $choice"
    exit 1
    ;;
esac

log "Verification finished."
info "To re-run from scratch: bash scripts/verify.sh --reset"
