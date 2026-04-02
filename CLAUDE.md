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

### Verification Automation (`verification/`)
Two types of automation:

1. **Playwright (TypeScript)** — Browser automation that creates Choreo components through the console UI. Uses the "Public GitHub Repository" flow. Config is in `.env` for dynamic org/project targeting.

2. **Cluster shell scripts** (`verification/scripts/cluster/`) — kubectl-based checks run against the private AKS cluster via SSH tunnel proxy (`HTTPS_PROXY=http://localhost:3129`). All scripts source `common.sh` for shared config.

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
| Component creation | Yes | Playwright (`npm run create:all`) |
| HTTP retries | Not yet | Needs Choreo endpoint config + log check |
| Cilium network policy enforcement | Not yet | Needs Choreo test console or curl from pods |
| 403s / upstream-not-found monitoring | Not yet | Needs `az monitor log-analytics query` |

## Commands

```bash
# Playwright setup
cd verification && bash scripts/setup.sh

# Login to Choreo (one-time)
npm run login

# Create all components
npm run create:all

# Cluster tests (SSH tunnel must be running)
bash scripts/cluster/cross-node-test.sh
bash scripts/cluster/hubble-observability-test.sh
bash scripts/cluster/transparent-encryption-test.sh
```
