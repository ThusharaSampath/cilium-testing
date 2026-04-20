#!/bin/bash
# Re-exec under real bash if invoked via `sh script.sh`. On macOS, `sh` is bash
# in POSIX mode: $BASH_VERSION is set, but process substitution + `echo -e`
# behave differently. $POSIXLY_CORRECT is the reliable signal.
if [ -z "$BASH_VERSION" ] || [ -n "$POSIXLY_CORRECT" ] || [ "${0##*/}" = "sh" ]; then
  exec bash "$0" "$@"
fi

# Prerequisite check for UI tracks.
#
# Validates:
#   1. Required .env vars are present.
#   2. `resourceRef: service:/<project-handler>/...` lines in the component.yaml
#      files under tester/ and service-to-service/project-level/client/ match
#      CHOREO_PROJECT_HANDLER. A mismatch causes deployments to fail because
#      Choreo resolves the connection target by project handler.
#
# On mismatch: offers to auto-patch, then reminds the user to commit and push
# to GITHUB_REPO_NAME (where Choreo pulls from) before proceeding.
#
# Exits non-zero if the user declines to fix a mismatch, or env is incomplete.

set -e

source "$(dirname "$0")/common.sh"

banner "Prerequisite Check"

ENV_FILE="$VERIFY_ROOT/.env"

# ── 1. Validate .env ──────────────────────────────────────

if [ ! -f "$ENV_FILE" ]; then
  fail ".env file not found at $ENV_FILE"
  info "Copy .env.example to .env and fill in values."
  exit 1
fi

# Load .env into this shell
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

REQUIRED_VARS=(
  CHOREO_CONSOLE_URL
  CHOREO_ORG_HANDLE
  CHOREO_ORG_ID
  CHOREI_ORG_UUID
  CHOREO_PROJECT_ID
  CHOREO_PROJECT_HANDLER
  GITHUB_REPO_NAME
  GITHUB_BRANCH
  GOOGLE_ACCOUNT_NAME
)

step "Checking required .env vars"
MISSING=()
for v in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!v}" ]; then
    MISSING+=("$v")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  fail "Missing required .env vars:"
  for v in "${MISSING[@]}"; do
    echo "    - $v"
  done
  info "Fill them in $ENV_FILE and re-run."
  exit 1
fi
log "All required .env vars present."

# ── 2. Validate project handler in component.yaml files ──

TOOLBOX_ROOT="$(cd "$VERIFY_ROOT/.." && pwd)"
COMPONENT_FILES=(
  "$TOOLBOX_ROOT/tester/.choreo/component.yaml"
  "$TOOLBOX_ROOT/service-to-service/project-level/client/.choreo/component.yaml"
)

step "Checking resourceRef project handler matches CHOREO_PROJECT_HANDLER=$CHOREO_PROJECT_HANDLER"

# Collect mismatches as "file|line|current_handler"
MISMATCHES=()
for f in "${COMPONENT_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    warn "Skipping missing file: $f"
    continue
  fi
  # Find lines like: resourceRef: service:/<handler>/...
  matches=$(grep -nE 'resourceRef:[[:space:]]*service:/' "$f" || true)
  [ -z "$matches" ] && continue
  while IFS=: read -r lineno rest; do
    # Extract the handler (1st segment after `service:/`)
    current=$(echo "$rest" | sed -E 's#.*service:/([^/]+)/.*#\1#')
    if [ -n "$current" ] && [ "$current" != "$CHOREO_PROJECT_HANDLER" ]; then
      MISMATCHES+=("$f|$lineno|$current")
    fi
  done <<EOF
$matches
EOF
done

if [ ${#MISMATCHES[@]} -eq 0 ]; then
  log "All resourceRef handlers match."
  log "Prerequisite check passed."
  exit 0
fi

# ── 3. Report mismatches ─────────────────────────────────

warn "Found ${#MISMATCHES[@]} resourceRef(s) that do not match CHOREO_PROJECT_HANDLER."
echo ""
# Unique set of (file, old-handler) pairs
declare -a OLD_HANDLERS=()
for m in "${MISMATCHES[@]}"; do
  file="${m%%|*}"
  rest="${m#*|}"
  lineno="${rest%%|*}"
  current="${rest##*|}"
  rel="${file#$TOOLBOX_ROOT/}"
  echo -e "  ${YELLOW}$rel:$lineno${NC} — has \"$current\", expected \"$CHOREO_PROJECT_HANDLER\""
  # Track unique old handlers
  found=0
  for h in "${OLD_HANDLERS[@]}"; do
    [ "$h" = "$current" ] && found=1 && break
  done
  [ $found -eq 0 ] && OLD_HANDLERS+=("$current")
done
echo ""

# ── 4. Offer to auto-patch ────────────────────────────────

echo -n "Auto-patch these files to use \"$CHOREO_PROJECT_HANDLER\"? [y/N]: "
read -r answer
answer="${answer:-N}"

if [[ ! "$answer" =~ ^[Yy]$ ]]; then
  fail "Cannot proceed with mismatched resourceRef handlers."
  info "Fix manually and re-run, or choose 'y' next time."
  exit 1
fi

# Patch each file for each old handler seen in it
PATCHED_FILES=()
for f in "${COMPONENT_FILES[@]}"; do
  [ -f "$f" ] || continue
  changed=0
  for old in "${OLD_HANDLERS[@]}"; do
    if grep -qE "resourceRef:[[:space:]]*service:/$old/" "$f"; then
      # macOS sed needs '' after -i
      sed -i.bak -E "s#(resourceRef:[[:space:]]*service:/)$old/#\\1$CHOREO_PROJECT_HANDLER/#g" "$f"
      rm -f "$f.bak"
      changed=1
    fi
  done
  [ $changed -eq 1 ] && PATCHED_FILES+=("$f")
done

echo ""
log "Patched ${#PATCHED_FILES[@]} file(s):"
for f in "${PATCHED_FILES[@]}"; do
  echo "    - ${f#$TOOLBOX_ROOT/}"
done

# ── 5. Remind to commit + push to GITHUB_REPO_NAME ───────

echo ""
warn "Choreo pulls these files from: $GITHUB_REPO_NAME (branch: $GITHUB_BRANCH)"
warn "You MUST commit and push the patched files to that repo before continuing,"
warn "otherwise Choreo will still see the old project handler and deployments will fail."
echo ""
info "Files to sync:"
for f in "${PATCHED_FILES[@]}"; do
  echo "    - ${f#$TOOLBOX_ROOT/}"
done
echo ""

prompt_continue "After committing & pushing to $GITHUB_REPO_NAME, press Enter to continue..."

log "Prerequisite check passed."
