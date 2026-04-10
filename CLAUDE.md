# Cilium Verification Toolbox

## Project Summary

This repository automates the verification of Cilium CNI compatibility on WSO2 Choreo dataplanes. When Choreo runs on a new dataplane (or after a Cilium upgrade), these tools validate that networking, observability, encryption, and Choreo component lifecycle all work correctly.

## What This Repo Contains

### Test Service Source Code
Go services deployed as Choreo components via the public GitHub repo `ThusharaSampath/cilium-testing`. Each service has a `.choreo/component.yaml` and `openapi.yaml` for Choreo auto-detection.

- `error-responder/` — Always returns HTTP 500. Used to test HTTP retry policies.
- `org-service/` — Organization-scoped service (network visibility: Organization).
- `project-service/` — Project-scoped service (network visibility: Project).
- `public-service/` — Publicly accessible service (network visibility: Public).
- `proxy-service/` — Reverse proxy that forwards to a backend URL (defaults to metadata endpoint `169.254.169.254`). Used to test metadata endpoint blocking via Cilium network policies.
- `service-to-service/project-level/server` and `client` — A pair that tests project-level service-to-service communication. The client calls the server's `/hello` endpoint via a Choreo connection.
- `tester/` — Central test service that calls org, public, project services and the webapp. Env vars are declared in `.choreo/component.yaml` via `configForm` so they appear in Choreo's config UI:
  - `ORG_SERVICE_URL` — Connection URL for org-service
  - `PUBLIC_SERVICE_URL` — Connection URL for public-service
  - `PROJECT_SERVICE_URL` — Connection URL for project-service
  - `WEBAPP_URL` — URL for the React webapp

  Endpoints:
  - `GET /test` — Calls all four services and returns aggregated results
  - `GET /test/org` — Calls org-service only
  - `GET /test/public` — Calls public-service only
  - `GET /test/project` — Calls project-service only
  - `GET /test/webapp` — Checks webapp reachability
  - `GET /health` — Health check

### Verification Automation (`verification/`)
Three types of automation:

1. **Playwright (TypeScript)** — Browser automation that creates Choreo components through the console UI, collects endpoint URLs, and invokes the test console. Uses the "Public GitHub Repository" flow. Config is in `.env` for dynamic org/project targeting.

2. **E2E Flows** — Two end-to-end Playwright flows that chain multiple steps together:
   - `e2e:tester` — Creates 5 components (org, public, project, webapp, tester), then prints next steps (wait for builds, collect URLs, update config, run full-test).
   - `e2e:s2s` — Creates server + client components with connection, then prints manual steps (wait for builds, update connection resourceRef, commit, push, rebuild, run full-test).
   - `full-test` — Runs both tester `/test` and s2s client `/hello` test consoles, reports combined pass/fail results.

3. **Cluster shell scripts** (`verification/scripts/cluster/`) — kubectl-based checks run against the private AKS cluster via SSH tunnel proxy (`HTTPS_PROXY=http://localhost:3129`). All scripts source `common.sh` for shared config.

### Reusable Helpers (`verification/src/helpers/`)
- `build-poller.ts` — Intercepts `deploymentStatusByVersion` GraphQL calls to capture componentId/versionId/token, then polls build status until success or timeout.
- `url-collector.ts` — Navigates to component overview pages and extracts endpoint URLs.
- `tester-config-updater.ts` — Fills tester env vars via the Configure & Deploy wizard.
- `test-console-runner.ts` — Opens a component's test console, executes an endpoint, and returns the response body.
- `component-creator.ts` — Creates components via the Choreo UI and returns build details for polling.
- `connection-creator.ts` — Creates service connections between components.

## Architecture Notes

- The AKS cluster is **private** — kubectl requires an SSH tunnel (`ssh-tunnel-dev-dp.sh`) that exposes an HTTPS proxy on `localhost:3129`.
- `kubectl port-forward` does not work through the proxy (websocket limitation). Cluster scripts use `kubectl exec` instead to run commands inside pods.
- Playwright runs in **headed mode** (visible browser). Google SSO login is done manually once; session is saved to `auth/storage-state.json`.
- All services are Go, listen on port 8080, and use `schemaVersion: 1.2` component.yaml format.

## Test Coverage

Defined in `verification/verification-steps.md`. Current automation status:

| Test | Automated | Method |
|---|---|---|
| Cross-node communication | Yes | `scripts/cluster/cross-node-test.sh` |
| Hubble observability (CLI + Prometheus) | Yes | `scripts/cluster/hubble-observability-test.sh` |
| Transparent encryption (WireGuard) | Yes | `scripts/cluster/transparent-encryption-test.sh` |
| CoreDNS connectivity | Yes | `scripts/cluster/coredns-test.sh` |
| Component creation | Yes | Playwright (`npm run create:all`) |
| Connection creation | Yes | Playwright (`npm run create:connection`) |
| Collect endpoint URLs | Yes | Playwright (`npm run collect:urls`) |
| Test console invocation | Yes | Playwright (`npm run test:console`) |
| E2E tester flow | Yes | Playwright (`npm run e2e:tester`) |
| E2E service-to-service flow | Partial | Playwright (`npm run e2e:s2s`) — connection resourceRef update is manual |
| Full verification test | Yes | Playwright (`npm run full-test`) |
| Build status polling | Available | GraphQL polling via `build-poller.ts` (not used in e2e flows, available for future use) |
| HTTP retries | Not yet | Needs Choreo endpoint config + log check |
| Cilium network policy enforcement | Partial | Webapp reachability via tester `/test/webapp`; rest needs curl from pods |
| 403s / upstream-not-found monitoring | Not yet | Needs `az monitor log-analytics query` |

## Commands

```bash
# Playwright setup
cd verification && bash scripts/setup.sh

# Login to Choreo (one-time)
npm run login

# --- E2E Flows (recommended) ---

# E2E: Create tester components, poll builds, then follow printed next steps
npm run e2e:tester

# E2E: Create s2s server+client, poll builds, then follow printed manual steps
npm run e2e:s2s

# Full test: Run tester + s2s client test consoles with combined report
npm run full-test

# --- Individual Steps ---

# Create all components
npm run create:all

# Create service connections
npm run create:connection

# Collect endpoint URLs from component overview pages
npm run collect:urls

# Update tester env config and redeploy
npm run update:config

# Invoke tester /test endpoint via Choreo test console
npm run test:console

# Cluster tests (SSH tunnel must be running)
bash scripts/cluster/cross-node-test.sh
bash scripts/cluster/hubble-observability-test.sh
bash scripts/cluster/transparent-encryption-test.sh
bash scripts/cluster/coredns-test.sh
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CHOREO_CONSOLE_URL` | — | Choreo console base URL |
| `CHOREO_ORG_HANDLE` | — | Organization handle |
| `CHOREO_PROJECT_NAME` | — | Project name |
| `GITHUB_REPO_NAME` | — | Public GitHub repo (e.g., `ThusharaSampath/cilium-testing`) |
| `GITHUB_BRANCH` | — | Git branch |
| `GOOGLE_ACCOUNT_NAME` | — | Google account name for SSO re-login |
| `BUILD_WAIT_MINUTES` | `20` | Max minutes for build polling timeout (used by `build-poller.ts`) |
