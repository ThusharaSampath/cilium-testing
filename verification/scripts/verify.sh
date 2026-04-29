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
echo "  1) All tracks (Tester + Infra)"
echo "  2) Tester track only"
echo "  3) Infrastructure track only"
echo ""
echo -n "Choice [1]: "
read -r choice
choice="${choice:-1}"

overall_status="ok"
cleanup_target=""

case "$choice" in
  1)
    info "Running all tracks."
    echo ""

    # Infra first — validates cluster foundation
    bash "$SCRIPT_DIR/track-infra.sh" || overall_status="failed"

    # Prereq check before UI tracks
    bash "$SCRIPT_DIR/prereq-check.sh"

    # UI tracks after infra passes
    check_auth

    bash "$SCRIPT_DIR/track-tester.sh" || overall_status="failed"

    # Run combined full-test for final report
    step "Final: Combined UI verification report"
    pw_run "full-test" || true

    cleanup_target="tester"
    if [ "$overall_status" = "ok" ]; then
      banner "ALL TRACKS COMPLETE"
    else
      banner "ALL TRACKS FINISHED — WITH FAILURES"
    fi
    ;;
  2)
    bash "$SCRIPT_DIR/prereq-check.sh"
    check_auth
    info "Running tester track only."
    bash "$SCRIPT_DIR/track-tester.sh" || overall_status="failed"
    cleanup_target="tester"
    ;;
  3)
    info "Running infra track only."
    bash "$SCRIPT_DIR/track-infra.sh" || overall_status="failed"
    # Infra track creates no components — no cleanup prompt.
    ;;
  *)
    fail "Invalid choice: $choice"
    exit 1
    ;;
esac

# Optional cleanup for tracks that create components
if [ -n "$cleanup_target" ]; then
  prompt_cleanup "$cleanup_target" "$overall_status" || true
fi

log "Verification finished."
info "To re-run from scratch: bash scripts/verify.sh --reset"

# Preserve non-zero exit so CI/automation can detect failure
if [ "$overall_status" = "failed" ]; then
  exit 1
fi
