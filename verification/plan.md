# Verification Automation Plan

## Goal

End-to-end bash orchestration that chains Playwright scripts and cluster tests together, with state tracking for resumability and manual pauses where needed. Three tracks: **tester** (UI), **s2s** (UI), **infra** (kubectl cluster tests).

## Status

| Task | Status | Notes |
|------|--------|-------|
| **Phase 1: Fix Broken Helpers** | | |
| 1a. Fix `tester-config-updater.ts` selectors | DONE | Updated via codegen recording. Needs live verify. |
| 1b. Fix `connection-creator.ts` selectors | DONE | Updated via codegen recording + idempotency added. Needs live verify. |
| 1c. Fix `e2e-s2s.spec.ts` — remove connection from create | DONE | Connection moved to separate step after builds. |
| 1d. Fix `google-relogin.ts` — redirect timing | DONE | Added 2s settle wait before URL check. |
| **Phase 2: Token Capture + Build Polling** | | |
| 2a. Create `token-capturer.ts` | DONE | Intercepts `sts.choreo.dev` response. Cached to `.choreo-token.json`. |
| 2b. Create `capture-token.spec.ts` + npm script | DONE | `npm run capture:token` — tested, working. |
| 2c. Create `poll-builds.spec.ts` | DONE | Uses token capturer + `build-poller.ts`. Not yet live tested. |
| 2d. Update `playwright.config.ts` | DONE | Added `capture-token` and `poll-builds` projects. |
| 2e. Update `package.json` | DONE | Added `capture:token`, `poll:builds`, `track:tester`, `track:s2s`, `verify`. |
| **Phase 3: Bash Orchestration** | | |
| 3a. Create `scripts/common.sh` | DONE | Logging, auth check, JSON state file, step runner. |
| 3b. Create `scripts/track-tester.sh` | DONE | 6-step flow. Not yet live tested. |
| 3c. Create `scripts/track-s2s.sh` | DONE | 5-step flow with manual pause. Not yet live tested. |
| 3d. Create `scripts/verify.sh` | DONE | Master with track selection menu + `--reset`. Not yet live tested. |
| **Phase 3b: Infra Track** | | |
| 3e. Create `scripts/track-infra.sh` | DONE | 5 tests + optional gateway monitor. Not yet live tested. |
| 3f. Update `verify.sh` with infra option | DONE | 4 menu options: all / tester / s2s / infra. |
| 3g. Add `track:infra` to `package.json` | DONE | `npm run track:infra` |
| **Phase 4: Cleanup** | | |
| 4a. Update `.gitignore` | DONE | Added state/token/har files. |
| 4b. Update `CLAUDE.md` | DONE | Documented new scripts and helpers. |

## Live Testing Checklist

| Test | Verified? | Command |
|------|-----------|---------|
| Token capture | YES | `npm run capture:token` |
| Tester config update | NO | `npm run update:config` (needs `collected-urls.json`) |
| Connection creation | NO | `npm run create:connection` (needs deployed server) |
| Build polling | NO | `POLL_COMPONENTS=tester npm run poll:builds` |
| Track tester (full) | NO | `bash scripts/track-tester.sh` |
| Track s2s (full) | NO | `bash scripts/track-s2s.sh` |
| Master verify | NO | `bash scripts/verify.sh` |
| Idempotency (re-run) | NO | `bash scripts/verify.sh` (run twice) |
| Reset + clean start | NO | `bash scripts/verify.sh --reset` |
| Track infra (full) | NO | `bash scripts/track-infra.sh` (needs cluster connectivity) |
| Master verify (all 3) | NO | `bash scripts/verify.sh` → option 1 |

## Architecture

```
verify.sh (master — menu: all / tester / s2s / infra)
  │
  ├── track-tester.sh (Playwright UI)
  │     1. Create 5 components (e2e-tester, idempotent)
  │     2. Poll builds (poll-builds + token-capturer)
  │     3. Collect URLs (collect-urls)
  │     4. Update tester config (update-tester-config)
  │     5. Poll tester redeploy
  │     6. Run tester /test (full-test -g "Tester")
  │
  ├── track-s2s.sh (Playwright UI)
  │     1. Create server + client (e2e-s2s, idempotent)
  │     2. Poll builds (poll-builds)
  │     3. ⏸ MANUAL: copy resourceRef, update component.yaml, commit, push, rebuild
  │     4. Poll client rebuild
  │     5. Run s2s /hello (full-test -g "S2S")
  │
  └── track-infra.sh (kubectl cluster tests)
        1. Cluster info (cluster-info.sh)
        2. CoreDNS connectivity (coredns-test.sh)
        3. Transparent encryption (transparent-encryption-test.sh)
        4. Hubble observability (hubble-observability-test.sh)
        5. Cross-node communication (cross-node-test.sh) — ~5 min
        6. [Optional] Gateway error monitor (gateway-error-monitor.sh) — ~10 min

State: .verification-state.json (resumable, --reset to clear)
Token: .choreo-token.json (cached, auto-refreshes on expiry)
Cluster: HTTPS_PROXY (AKS) or KUBECONFIG (OpenShift) via .env CLUSTER var
```

## Known Issues / TODO

- `tester-config-updater.ts` and `connection-creator.ts` selectors updated from codegen but not yet verified against live Choreo UI
- `poll-builds.spec.ts` navigates to overview pages to capture componentId/versionId — needs live test to confirm GraphQL interception works with STS token
- S2S connection resourceRef step is still manual (requires Choreo UI + git push to separate repo)
- Verbose debug logging in `tester-config-updater.ts` — remove once verified working
