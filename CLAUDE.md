# Cilium Verification Toolbox

## Project Summary

This repository validates Cilium CNI compatibility on WSO2 Choreo dataplanes. When Choreo runs on a new dataplane (or after a Cilium upgrade), these tools verify that networking, observability, encryption, network-policy enforcement, and Choreo component lifecycle all work correctly.

## What This Repo Contains

Important
- The cluster scripts assume your shell already has `kubectl` configured to reach the target PDP cluster. How you achieve that (KUBECONFIG, proxy/SSH tunnel, `oc login`, etc.) is your responsibility.
- If you create/update/delete a cluster artifact, back up the original first (`<good-name>-<timestamp>.yaml`), document the change briefly in the relevant README, and keep the new/updated artifact alongside the backup.
- If you do a task that could be automated and it's worth doing, ask me to create a script for it.

### Test Service Source Code
Go services deployed as Choreo components via the connected GitHub repo (`GITHUB_REPO_NAME` in `.env`). Each service has a `.choreo/component.yaml` and `openapi.yaml` for Choreo auto-detection.

- `org-service/` — Organization-scoped service (network visibility: Organization).
- `project-service/` — Project-scoped service (network visibility: Project). Doubles as the project-level service-to-service target — `tester` calls it via a Choreo connection.
- `public-service/` — Publicly accessible service (network visibility: Public).
- `tester/` — Central service that calls org, public, project services and the webapp. Connection URLs come in as env vars declared in `.choreo/component.yaml` (auto-populated from Choreo connections).

  Endpoints:
  - `GET /test` — Calls all four services and returns aggregated results
  - `GET /test/org` — Calls org-service only
  - `GET /test/public` — Calls public-service only
  - `GET /test/project` — Calls project-service only
  - `GET /test/webapp` — Checks webapp reachability
  - `GET /health` — Health check
- `react-single-page-app/` — React webapp deployed as a Choreo Web Application component.

### Verification Automation (`verification/`)

Three layers:

1. **Bash orchestration** (`verification/scripts/`) — `verify.sh` is the canonical entry point with a 3-option menu (all / tester only / infra only). Each track is a numbered, state-tracked sequence of steps written to `.verification-state.json` for resumability.
   - `track-infra.sh` — kubectl-based cluster checks.
   - `track-tester.sh` — tester pipeline (create → poll builds → create connections → redeploy → poll deployment → test → webapp → observability). Also covers project-level service-to-service via the `tester → project-service` connection.
   - `prereq-check.sh` — validates `.env` and `resourceRef` lines in component.yamls match `CHOREO_PROJECT_HANDLER`.
   - `common.sh` — shared logging, auth check, JSON state file, step runner.

2. **GraphQL/API helpers** (`verification/src/helpers/api-*.ts`) — TypeScript modules invoked by the bash tracks via `npx tsx`. Component creation, build polling, deployment polling, redeploys, endpoint invocation, webapp reachability, and observability (logs+metrics) are all driven through Choreo's GraphQL/data-plane APIs — not the UI. STS tokens are auto-refreshed by `token-loader.ts` (which transparently re-runs the `capture-token` Playwright project when needed).

3. **Playwright (UI)** — used only for things that require the UI:
   - `setup-auth.spec.ts` — manual Google SSO login (one-time, headed browser).
   - `capture-token.spec.ts` — captures the STS token (auto-invoked by `token-loader.ts`).
   - `create-tester-connections.spec.ts` — legacy UI fallback for tester connections (the API-based `api-connection-creator.ts` is now the primary path, used by `track-tester.sh`).
   - `test-console.spec.ts` / `full-test.spec.ts` — invokes the in-console test runner; `full-test` produces the tester report at the end of `verify.sh` option 1.

4. **Cluster shell scripts** (`verification/scripts/cluster/`) — `kubectl`-based checks against the target PDP cluster. The shell that invokes them must already be configured to reach the cluster. All scripts source `common.sh` for shared logging and `verify_cluster` connectivity check. Test manifests live under `verification/scripts/cluster/manifests/`.

### Reusable Helpers (`verification/src/helpers/`)

API-based (current main flow):
- `api-component-creator.ts` — Creates components via the GraphQL `createBuildpackComponent` / `createByocComponent` mutations. Idempotent (skips existing).
- `api-connection-creator.ts` — Creates service connections via REST + GraphQL APIs (marketplace lookup → `choreo-connections` POST). Idempotent (skips existing).
- `api-build-poller.ts` — Polls build status until success/failure for one or more components in parallel.
- `api-deployment-poller.ts` — Polls deployment status until ACTIVE.
- `api-redeployer.ts` — Redeploys a component via the `deployDeploymentTrack` mutation.
- `api-test-runner.ts` — Fetches a component's endpoint, generates a test API key, calls the endpoint via the data plane.
- `api-webapp-tester.ts` — Resolves a Web Application's `invokeUrl` via `componentDeployment` and curls it.
- `api-observability-tester.ts` — Validates that logs and metrics are flowing through Choreo's observability APIs for a component.
- `token-loader.ts` — STS token cache + auto-refresh (re-launches `capture-token` Playwright project when expired).
- `token-capturer.ts` — Captures the STS token by intercepting `sts.choreo.dev/oauth2/token`.

UI-based (only what still needs the UI):
- `auth.ts` — Manual SSO login helper (used by `setup-auth.spec.ts`).
- `google-relogin.ts` — Auto re-login on session expiry.
- `connection-creator.ts` — Legacy UI fallback for connection creation (no longer the primary path; superseded by `api-connection-creator.ts`).
- `test-console-runner.ts` — Opens a component's test console, executes an endpoint, returns the response body.

## Architecture Notes

- Target PDP clusters are typically private. Set up cluster access (KUBECONFIG, SSH-tunnel + `HTTPS_PROXY`, `oc login`, etc.) in your shell before running the cluster scripts.
- `kubectl port-forward` does not work over an HTTPS proxy (websocket limitation). When access is via a tunnel proxy, cluster scripts use `kubectl exec` instead to run commands inside pods.
- Playwright runs in **headed mode** (visible browser). Google SSO login is done manually once; session is saved to `auth/storage-state.json`.
- Test services are Go, listen on port 8080, and use `schemaVersion: 1.2` component.yaml format.

## Test Coverage

Defined in `verification/verification-steps.md`. Current automation status:

| Test | Automated | Method |
|---|---|---|
| Cross-node communication | Yes | `scripts/cluster/cross-node-test.sh` |
| Hubble observability (CLI + Prometheus) | Yes | `scripts/cluster/hubble-observability-test.sh` |
| Transparent encryption (WireGuard) | Yes | `scripts/cluster/transparent-encryption-test.sh` |
| CoreDNS connectivity | Yes | `scripts/cluster/coredns-test.sh` |
| Cross-namespace isolation | Yes | `scripts/cluster/cross-namespace-isolation-test.sh` |
| Metadata endpoint blocking | Yes | `scripts/cluster/metadata-endpoint-test.sh` |
| Component creation | Yes | GraphQL via `npm run create:api` |
| Build polling | Yes | GraphQL via `npm run poll:api` |
| Connection creation | Yes | REST/GraphQL via `npm run create:connection:api` |
| Component redeploy | Yes | GraphQL via `npm run redeploy` |
| Endpoint invocation | Yes | Data plane via `npm run test:api` |
| Webapp reachability | Yes | `npm run test:webapp` |
| Logs + metrics observability | Yes | `npm run test:obs` |
| Combined UI report | Yes | `npm run full-test` |
| 403s / upstream-not-found monitoring | Yes (optional) | `scripts/cluster/gateway-error-monitor.sh` |
| HTTP retries | Not yet | Needs Choreo endpoint config + log check |

## Commands

```bash
# Setup
cd verification && bash scripts/setup.sh

# One-time Google SSO login
npm run login

# --- Canonical entry point ---

# Full verification — interactive menu (all / tester / infra)
bash scripts/verify.sh

# Reset persisted state and start fresh
bash scripts/verify.sh --reset

# --- Individual tracks ---

bash scripts/track-infra.sh
bash scripts/track-tester.sh

# --- Individual API helpers (ad-hoc) ---

npm run create:api -- tester           # or no arg for all
npm run create:connection:api -- tester
npm run poll:api -- tester,org-service
npm run poll:deployment -- tester
npm run redeploy -- tester
npm run test:api -- tester /test
npm run test:webapp
npm run test:obs -- tester

# --- UI-driven helpers ---
npm run create:tester-connections
npm run test:console
npm run full-test

# --- Cluster tests (require kubectl access) ---

bash scripts/cluster/cross-node-test.sh
bash scripts/cluster/hubble-observability-test.sh
bash scripts/cluster/transparent-encryption-test.sh
bash scripts/cluster/coredns-test.sh
bash scripts/cluster/cross-namespace-isolation-test.sh
bash scripts/cluster/metadata-endpoint-test.sh
```

## Environment Variables

See `verification/.env.example` for the full template.

| Variable | Default | Description |
|---|---|---|
| `CHOREO_CONSOLE_URL` | — | Choreo console base URL |
| `CHOREO_ORG_HANDLE` | — | Organization handle |
| `CHOREO_ORG_ID` | — | Organization numeric ID |
| `CHOREO_PROJECT_HANDLER` | — | Project handle |
| `CHOREO_PROJECT_ID` | — | Project UUID |
| `GITHUB_REPO_NAME` | — | GitHub repo connected to the org (e.g., `<owner>/<repo>`) |
| `GITHUB_BRANCH` | `main` | Git branch to build from |
| `GOOGLE_ACCOUNT_NAME` | — | Google account name for SSO re-login |
| `BUILD_WAIT_MINUTES` | `20` | Max minutes for build polling timeout |
| `CILIUM_NS` | `kube-system` | Namespace where Cilium pods run (override on OpenShift: `cilium`) |
| `APIM_NS` | `choreo-apim` | APIM namespace for the gateway error monitor |
