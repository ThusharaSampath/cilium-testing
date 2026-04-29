# Cilium Verification Automation

Automation for verifying Cilium compatibility on WSO2 Choreo dataplanes. The suite has two tracks:

1. **Infra** — `kubectl`-based checks (cross-node, Hubble, encryption, DNS, isolation, metadata block).
2. **Tester** — creates `org-service`, `public-service`, `project-service`, `tester`, and the React webapp via Choreo's GraphQL API; wires connections via the connections REST API; runs the tester `/test` aggregate via the Choreo data plane. Project-level service-to-service is exercised here too via the `tester → project-service` connection (project-service runs scale-to-zero by default, so this also covers cold-start behavior on a project-scoped target).

Tracks are orchestrated by `bash scripts/verify.sh`, which persists progress in `.verification-state.json` so re-runs resume from the last failure. Component creation, connection creation, build polling, deployment polling, redeploys, and endpoint invocation all use Choreo's GraphQL/REST APIs directly. Playwright is only used for Google SSO login (manual, one-time) and the in-console test runner used by the final report.

## Prerequisites

### Common
- Node.js >= 18 and npm
- A Choreo organization + project (created beforehand)
- A GitHub repo connected to the org that contains the test service source code (this repo, by default `ThusharaSampath/cilium-testing`), you can change the repo in .env file.

### For the Tester track
- Google account with access to the target Choreo org
- After `npm run login`, `auth/storage-state.json` holds a reusable session

### For the Infra track
- `kubectl` on PATH
- Your shell already configured to reach the target PDP cluster — for example any one of:
  - `export KUBECONFIG=/path/to/kubeconfig`
  - `oc login ...`
- Verify with `kubectl cluster-info`

## Setup

```bash
cd verification

# Install dependencies + Chromium and bootstrap .env
bash scripts/setup.sh
```

Edit `.env` — see `.env.example` for the full list of variables.

## Running

```bash
# One-time Google SSO login (headed browser, manual)
npm run login

# Full verification — interactive menu
bash scripts/verify.sh

# Reset persisted state and re-run from scratch
bash scripts/verify.sh --reset
```

`verify.sh` offers three options:

| Option | Tracks | Notes |
|---|---|---|
| 1 | Infra → Tester → final UI report | Default. Stops at first hard failure; soft failures are summarized at the end. |
| 2 | Tester only | Skips infra. Project-level service-to-service is covered here via the `tester → project-service` connection. |
| 3 | Infra only | No Choreo console interaction needed. |

State lives in `.verification-state.json` — a step that completes is marked done and skipped on the next run.

## Individual track entry points

```bash
bash scripts/track-infra.sh        # cluster checks (Track 1)
bash scripts/track-tester.sh       # tester pipeline (Track 2) — also covers project-level S2S
```

## Individual helpers (for ad-hoc debugging)

The bash tracks call these helpers directly via `npx tsx` — they're also runnable on their own:

```bash
# Component creation (GraphQL)
npm run create:api -- tester        # tester group only

# Connection creation (REST + GraphQL, idempotent)
npm run create:connection:api -- tester

# Build / deployment polling
npm run poll:api -- tester,org-service
npm run poll:deployment -- tester

# Redeploy after a config / connection change
npm run redeploy -- tester

# Run the tester /test endpoint via the data plane
npm run test:api -- tester /test

# Webapp reachability
npm run test:webapp

# Logs + metrics observability check for a component
npm run test:obs -- tester
```

Playwright-driven steps that still need the UI:

```bash
# In-console test runner used by the final report
npm run test:console
npm run full-test

# Legacy fallback for connection creation (the primary path is now create:connection:api)
npm run create:tester-connections
```

STS tokens are auto-refreshed by `token-loader.ts` whenever an API helper runs — no manual `capture:token` step.

## Cluster scripts (Track 1 detail)

All under `scripts/cluster/`. Each can be run standalone; `track-infra.sh` chains them.

| Script | What it tests | Duration |
|---|---|---|
| `cluster-info.sh` | Prints Kubernetes / Cilium / runtime / platform info | < 5s |
| `coredns-test.sh` | DNS pod health + cluster-internal/external resolution | < 30s |
| `transparent-encryption-test.sh` | WireGuard active on every node with N-1 peers | < 30s |
| `hubble-observability-test.sh` | Hubble L7 observation + `hubble_http_requests_total` Prometheus series | ~15s |
| `metadata-endpoint-test.sh` | `169.254.169.254` is unreachable from user-app pods | < 30s |
| `cross-namespace-isolation-test.sh` | Cross-namespace pod-IP and service-DNS calls are blocked | ~30s |
| `cross-node-test.sh` | Cross-node HTTP requests aren't silently dropped | ~5 min |
| `gateway-error-monitor.sh` | Watches the external gateway for 403s / "upstream not found" | ~10 min (optional) |

Per-script READMEs:
- [Cross-Node Test](scripts/cluster/README-cross-node-test.md)
- [Hubble Observability Test](scripts/cluster/README-hubble-observability-test.md)
- [Transparent Encryption Test](scripts/cluster/README-transparent-encryption-test.md)

Override defaults per cluster via env vars (e.g. `CILIUM_NS=cilium` on OpenShift, `APIM_NS=dev-choreo-apim` on the AKS dev cluster). Test manifests live under `scripts/cluster/manifests/`.

## Directory structure

```
verification/
  .env.example                # Config template (committed)
  .env                        # Your config (gitignored)
  playwright.config.ts        # Playwright projects: auth-setup, capture-token,
                              # create-tester-connections (legacy fallback),
                              # test-console, full-test
  auth/                       # Saved browser session (gitignored)
  src/
    config/
      env.ts                  # Loads and validates .env
      api-components.ts       # GraphQL component definitions (current creation flow)
      components.ts           # Connection definitions consumed by api-connection-creator
    helpers/
      auth.ts                 # Manual SSO login helper
      google-relogin.ts       # Auto re-login on session expiry
      token-loader.ts         # STS token cache + auto-refresh
      token-capturer.ts       # Captures token from sts.choreo.dev
      api-component-creator.ts
      api-component-cleanup.ts
      api-connection-creator.ts # Connection creation via REST + GraphQL (primary path)
      api-build-poller.ts
      api-deployment-poller.ts
      api-redeployer.ts
      api-test-runner.ts
      api-webapp-tester.ts
      api-observability-tester.ts
      connection-creator.ts   # Legacy UI fallback for connection creation
      test-console-runner.ts  # UI flow: invoke a component's test console
    tests/
      setup-auth.spec.ts            # One-time Google SSO login
      capture-token.spec.ts         # STS token capture (auto-invoked by token-loader)
      create-tester-connections.spec.ts  # Legacy UI fallback for tester connections
      test-console.spec.ts          # Invoke tester test console
      full-test.spec.ts             # Final tester report
  scripts/
    setup.sh                  # Install dependencies + bootstrap .env
    common.sh                 # Logging, state file, step runner
    prereq-check.sh           # Validates .env + connection resourceRefs
    verify.sh                 # Master orchestrator (interactive menu)
    track-infra.sh            # Track 1
    track-tester.sh           # Track 2 (also covers project-level S2S)
    cluster/
      common.sh               # Shared logging + verify_cluster
      cluster-info.sh
      coredns-test.sh
      cross-namespace-isolation-test.sh
      cross-node-test.sh
      hubble-observability-test.sh
      metadata-endpoint-test.sh
      transparent-encryption-test.sh
      gateway-error-monitor.sh
      ecr-pull-secret-cronjob.sh   # OpenShift-only utility
      manifests/
        cross-namespace-isolation-test.yaml
        cross-node-request-drop-test.yaml
  test-results/               # Screenshots/videos on failure (gitignored)
```

## Troubleshooting

### Playwright login session expired
Re-run `npm run login` to get a fresh session.

### `kubectl: "no such host"` or connection-refused
Your shell isn't reaching the target cluster. Check:
- `kubectl config current-context` matches the target cluster.
- Confirm with `kubectl cluster-info`.
