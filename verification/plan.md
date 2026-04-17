# Verification Automation Plan

## Goal

End-to-end orchestration that creates Choreo components, polls builds, runs tests, and validates cluster infrastructure — all with state tracking for resumability. Three tracks: **tester** (API + Playwright), **s2s** (API + Playwright), **infra** (kubectl cluster tests).

## Status

| Task | Status | Notes |
|------|--------|-------|
| **Phase 1: Fix Broken Helpers** | | |
| 1a. Fix `tester-config-updater.ts` selectors | DONE | Removed — replaced by connections approach. |
| 1b. Fix `connection-creator.ts` selectors | DONE | Updated via codegen recording + idempotency added. Live verified. |
| 1c. Fix `e2e-s2s.spec.ts` — remove connection from create | DONE | Connection moved to separate step after builds. |
| 1d. Fix `google-relogin.ts` — redirect timing | DONE | Added 2s settle wait before URL check. |
| **Phase 2: API-based Component Creation** | | |
| 2a. Create `api-components.ts` config | DONE | All 7 components with tester/s2s groups. |
| 2b. Create `api-component-creator.ts` | DONE | GraphQL mutations, idempotent (fetches existing first). Live verified. |
| 2c. Add `create:api`, `create:api:tester`, `create:api:s2s` scripts | DONE | Replaces Playwright UI component creation. |
| **Phase 3: API-based Build Polling** | | |
| 3a. Create `api-build-poller.ts` | DONE | Uses `deploymentTracks[0].id` as versionId. Polls in parallel. Live verified. |
| 3b. Add `poll:api` script | DONE | `npm run poll:api -- comp1,comp2` |
| **Phase 4: API-based Testing** | | |
| 4a. Create `api-test-runner.ts` | DONE | Fetches endpoint → generates test key → calls endpoint. Live verified. |
| 4b. Add `test:api` script | DONE | `npm run test:api -- component /path` |
| **Phase 5: Token Auto-refresh** | | |
| 5a. Create `token-loader.ts` | DONE | Shared module. Auto-launches Playwright to refresh if expired. |
| 5b. All API scripts use `token-loader.ts` | DONE | No manual `capture:token` needed. |
| **Phase 6: Bash Orchestration** | | |
| 6a. Create `scripts/common.sh` | DONE | Logging, auth check, JSON state file, step runner. |
| 6b. Create `scripts/track-tester.sh` | DONE | 6-step flow with connections. Not yet live tested. |
| 6c. Create `scripts/track-s2s.sh` | DONE | 4-step flow. Live verified. |
| 6d. Create `scripts/verify.sh` | DONE | Master with track selection menu + `--reset`. Live verified. |
| **Phase 6b: Infra Track** | | |
| 6e. Create `scripts/track-infra.sh` | DONE | 5 tests + optional gateway monitor. Live verified. |
| 6f. Update `verify.sh` with infra option | DONE | 4 menu options: all / tester / s2s / infra. |
| **Phase 7: Cleanup** | | |
| 7a. Update `.gitignore` | DONE | Added state/token/har files. |
| 7b. Update `CLAUDE.md` | DONE | Documented new scripts and helpers. |
| **Phase 8: Connections Migration** | | |
| 8a. Tester uses Choreo connections instead of manual URLs | DONE | 3 connections: tester-to-org, tester-to-public, tester-to-project |
| 8b. Connection creator supports batch creation on one page | DONE | `createConnections()` — single page load, sequential creation |
| 8c. Track isolation for connections | DONE | Separate specs: `create-connections` (s2s only), `create-tester-connections` (tester only) |
| 8d. Tester returns 500 on failure | DONE | handleAll + handleSingle check for errors/non-2xx |
| 8e. Deployment status polling before test | DONE | `api-deployment-poller.ts` polls until ACTIVE |
| 8f. Webapp tested separately | DONE | `api-webapp-tester.ts` gets invokeUrl from componentDeployment |
| 8g. Removed obsolete files | DONE | url-collector, tester-config-updater, collect-urls spec, update-tester-config spec |

## Live Testing Checklist

| Test | Verified? | Command |
|------|-----------|---------|
| Token capture | YES | `npm run capture:token` |
| Token auto-refresh | YES | Triggered automatically when token expires |
| API component creation (idempotent) | YES | `npm run create:api:s2s` |
| API build polling (parallel) | YES | `npm run poll:api -- server,client` |
| API test runner | YES | `npm run test:api -- client /` |
| Connection creation — s2s (Playwright) | YES | `npx playwright test --project=create-connections` |
| Connection creation — tester (Playwright) | NO | `npx playwright test --project=create-tester-connections` |
| Deployment polling | NO | `npm run poll:deployment -- tester` |
| Webapp test | NO | `npm run test:webapp` |
| Track s2s (full) | YES | `bash scripts/track-s2s.sh` |
| Track tester (full) | NO | `bash scripts/track-tester.sh` |
| Track infra (full) | YES | `bash scripts/track-infra.sh` |
| Master verify (s2s + infra) | YES | `bash scripts/verify.sh` → options 3, 4 |
| Master verify (all 3) | NO | `bash scripts/verify.sh` → option 1 |
| Idempotency (re-run) | YES | State file skips completed steps |
| Reset + clean start | YES | `bash scripts/verify.sh --reset` |

## Architecture

```
verify.sh (master — menu: all / tester / s2s / infra)
  │
  ├── track-tester.sh (API + Playwright)                    [WORKING: Org-invocation is failing, thats a choreo issue]
  │     1. Create 5 components (incl. webapp — api-component-creator, idempotent)
  │     2. Poll builds for services only (webapp build checked in step 7)
  │     3. Create 3 connections (Playwright create-tester-connections)
  │     4. Redeploy tester (api-redeployer)
  │     5. Poll deployment ACTIVE (api-deployment-poller)
  │     6. Run tester /test (api-test-runner)
  │     7. Test webapp (poll build → poll deploy → curl invokeUrl)
  │
  ├── track-s2s.sh (API + Playwright)                       [WORKING]
  │     1. Create server + client (api-component-creator, idempotent)
  │     2. Poll builds (api-build-poller, parallel)
  │     3. Create connection (Playwright connection-creator)
  │     4. Redeploy client (api-redeployer)
  │     5. Run s2s client / (api-test-runner)
  │
  └── track-infra.sh (kubectl cluster tests)                [WORKING]
        1. Cluster info (cluster-info.sh)
        2. CoreDNS connectivity (coredns-test.sh)
        3. Transparent encryption (transparent-encryption-test.sh)
        4. Hubble observability (hubble-observability-test.sh)
        5. Cross-node communication (cross-node-test.sh) — ~5 min
        6. [Optional] Gateway error monitor (gateway-error-monitor.sh) — ~10 min

Token: .choreo-token.json (cached, auto-refreshes via Playwright on expiry)
State: .verification-state.json (resumable, --reset to clear)
Cluster: HTTPS_PROXY (AKS) or KUBECONFIG (OpenShift) via .env CLUSTER var
```

## Webapp Note

Webapp (`react-single-page-app`) is created in step 1 of the tester track along with the other components. Its build is NOT waited on during step 2 (only services are polled). After the tester service test completes (step 6), step 7 runs `npm run test:webapp` which polls the webapp build, waits for deployment ACTIVE, fetches `invokeUrl` from `componentDeployment`, and curls it. This way the webapp build runs in parallel with the tester setup.

`npm run test:webapp` can also be run standalone — it handles build polling + deployment polling + testing in one script.

## TODO

- **Tester track**: Live test the full flow — push Go changes, run `bash scripts/track-tester.sh`
- **Tester component.yaml**: Update `resourceRef` placeholders with real values after first connection creation
- ~~**S2S + Tester tracks**: Automate the manual "Deploy" step~~ — DONE: `api-redeployer.ts` calls `deployDeploymentTrack` mutation
