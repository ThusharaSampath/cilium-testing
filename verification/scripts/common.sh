#!/bin/bash
# Common utilities for verification orchestration scripts.
# Source this file: source "$(dirname "$0")/common.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_FILE="$VERIFY_ROOT/.verification-state.json"
AUTH_FILE="$VERIFY_ROOT/auth/storage-state.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()   { echo -e "${YELLOW}[!]${NC} $*"; }
fail()   { echo -e "${RED}[✗]${NC} $*"; }
info()   { echo -e "${BLUE}[i]${NC} $*"; }
step()   { echo -e "${CYAN}${BOLD}━━━ $* ━━━${NC}"; }

banner() {
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║  $*${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

# ── Auth ──────────────────────────────────────────────────

check_auth() {
  if [ ! -f "$AUTH_FILE" ]; then
    fail "No auth state found."
    info "Run 'npm run login' first to complete Google SSO."
    exit 1
  fi
}

# ── State file (JSON) ────────────────────────────────────

# Initialize state file if it doesn't exist
init_state() {
  if [ ! -f "$STATE_FILE" ]; then
    echo '{}' > "$STATE_FILE"
  fi
}

# Check if a step is already completed
# Usage: if check_step_done "step_name"; then echo "skip"; fi
check_step_done() {
  local step_name="$1"
  init_state
  local val
  val=$(python3 -c "
import json, sys
with open('$STATE_FILE') as f:
    state = json.load(f)
print(state.get('$step_name', ''))
" 2>/dev/null)
  [ "$val" = "done" ]
}

# Mark a step as completed
mark_step_done() {
  local step_name="$1"
  init_state
  python3 -c "
import json
with open('$STATE_FILE', 'r') as f:
    state = json.load(f)
state['$step_name'] = 'done'
with open('$STATE_FILE', 'w') as f:
    json.dump(state, f, indent=2)
"
}

# Clear all state (used with --reset)
clear_state() {
  rm -f "$STATE_FILE"
  log "State cleared."
}

# ── Step runner ──────────────────────────────────────────

# Run a step with state tracking and logging.
# Usage: run_step "step_name" "Description" command arg1 arg2 ...
#
# Skips if already completed. Marks done on success. Exits on failure.
run_step() {
  local step_name="$1"
  local description="$2"
  shift 2

  if check_step_done "$step_name"; then
    log "$description — already done, skipping."
    return 0
  fi

  step "$description"

  if "$@"; then
    mark_step_done "$step_name"
    log "$description — done."
  else
    fail "$description — FAILED."
    fail "Fix the issue and re-run. The script will resume from this step."
    exit 1
  fi
}

# Run a step that continues on failure instead of exiting.
# Appends to FAILURES array on error. Caller must declare: FAILURES=()
# Usage: run_step_soft "step_name" "Description" command arg1 arg2 ...
run_step_soft() {
  local step_name="$1"
  local description="$2"
  shift 2

  if check_step_done "$step_name"; then
    log "$description — already done, skipping."
    return 0
  fi

  step "$description"

  if "$@"; then
    mark_step_done "$step_name"
    log "$description — done."
  else
    fail "$description — FAILED."
    FAILURES+=("$description")
  fi
}

# ── User prompts ─────────────────────────────────────────

# Pause and wait for user to press Enter
prompt_continue() {
  local message="${1:-Press Enter to continue...}"
  echo ""
  echo -e "${YELLOW}${BOLD}  ⏸  $message${NC}"
  read -r
}

# Optional component cleanup prompt. Call with the cleanup target ("tester",
# "s2s", or "all") and a status: "ok" or "failed". On failure, prints a red
# warning that cleanup forces a full re-run (state is preserved on skip).
# Honors VERIFY_NONINTERACTIVE=1 (skips cleanup, no prompt).
prompt_cleanup() {
  local target="$1"
  local status="${2:-ok}"

  if [ "${VERIFY_NONINTERACTIVE:-0}" = "1" ]; then
    info "Skipping cleanup prompt (VERIFY_NONINTERACTIVE=1)."
    return 0
  fi

  echo ""
  if [ "$status" = "failed" ]; then
    echo -e "${RED}${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}${BOLD}║  WARNING — tests failed                                  ║${NC}"
    echo -e "${RED}${BOLD}╠══════════════════════════════════════════════════════════╣${NC}"
    echo -e "${RED}║  Verification state is preserved. Re-running             ${NC}"
    echo -e "${RED}║  ${BOLD}bash scripts/verify.sh${NC}${RED} resumes from the failed step    ${NC}"
    echo -e "${RED}║  and skips everything that already passed.               ${NC}"
    echo -e "${RED}║                                                          ${NC}"
    echo -e "${RED}║  Choosing cleanup below DELETES the components and       ${NC}"
    echo -e "${RED}║  ${BOLD}clears state${NC}${RED} — the next run starts from scratch         ${NC}"
    echo -e "${RED}║  (component creation, builds, connections, deploys).     ${NC}"
    echo -e "${RED}${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
  fi

  echo -e "${YELLOW}${BOLD}Delete leftover components for target '${target}'? [y/N]:${NC} \c"
  read -r answer
  case "${answer:-N}" in
    y|Y|yes|YES)
      step "Cleanup: deleting components (target=${target})"
      cd "$VERIFY_ROOT"
      if npx tsx src/helpers/api-component-cleanup.ts "$target"; then
        log "Cleanup complete."
        clear_state
        info "State cleared — the next verification run will start from scratch."
      else
        fail "Cleanup did not complete cleanly. Review output above."
        info "State NOT cleared. Re-run cleanup or fix manually before retrying."
        return 1
      fi
      ;;
    *)
      info "Cleanup skipped. State preserved — re-run resumes from the failed step."
      ;;
  esac
}

# ── Playwright runner ────────────────────────────────────

# Run a Playwright test project from the verification root
# Usage: pw_run "project-name" [extra args...]
pw_run() {
  local project="$1"
  shift
  cd "$VERIFY_ROOT"
  npx playwright test --project="$project" "$@"
}
