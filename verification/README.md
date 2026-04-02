# Cilium Verification Automation

Automated tests for verifying Cilium compatibility on WSO2 Choreo dataplanes. This directory contains two types of automation:

1. **Playwright UI automation** — creates Choreo components via the browser
2. **Cluster shell scripts** — runs kubectl-based checks directly on the AKS cluster

## How Playwright Works

[Playwright](https://playwright.dev/) is a browser automation framework. It launches a real Chromium browser and controls it programmatically — clicking buttons, filling forms, navigating pages — just like a human would, but driven by TypeScript code.

We use it here because Choreo components must be created through the web console (there's no CLI/API for this). Playwright automates the full UI flow:

1. Opens the Choreo console in Chromium
2. Navigates to the target project
3. Clicks through the "Create a Service" workflow
4. Selects the public GitHub repo, picks the directory, and submits

**Headed mode**: The browser window is visible so you can watch what's happening. All our scripts run in headed mode for transparency.

**Auth handling**: Google SSO can't be automated (Google blocks bot logins), so you complete the login manually once. Playwright saves the session cookies to `auth/storage-state.json` and reuses them for subsequent runs.

## Prerequisites

### For Playwright (component creation)
- Node.js >= 18 and npm
- Google account with access to the target Choreo organization
- The public GitHub repo `ThusharaSampath/cilium-testing` containing the test service source code
- A project must already exist in the Choreo org

### For cluster scripts
- Azure CLI (`az`) logged in
- kubectl configured with AKS credentials:
  ```bash
  az aks get-credentials --resource-group choreo-dev-dataplane-002-aks-rg \
    --name choreo-dev-dataplane-aks-cluster-002 --overwrite-existing
  ```
- SSH tunnel to the private AKS cluster running:
  ```bash
  sh ssh-tunnel-dev-dp.sh <username>
  ```
  This creates an HTTPS proxy on `localhost:3129` that kubectl uses to reach the private API server.

## Setup

```bash
cd verification

# Install dependencies and Chromium
bash scripts/setup.sh
```

Edit `.env` with your Choreo org and project:

```
CHOREO_CONSOLE_URL=https://consolev2.preview-dv.choreo.dev
CHOREO_ORG_HANDLE=<your-org-handle>
CHOREO_PROJECT_NAME=<your-project-name>
GITHUB_REPO_NAME=ThusharaSampath/cilium-testing
GITHUB_BRANCH=main
```

## Running Tests

### Phase 1: Create Choreo Components (Playwright)

```bash
# Step 1: Login (one-time, opens browser for manual Google SSO)
npm run login

# Step 2: Create all 7 test components
npm run create:all

# Or create one specific component
bash scripts/create-one.sh error-responder
```

Available components:

| Component | Source Directory | Purpose |
|---|---|---|
| `error-responder` | `error-responder` | Returns HTTP 500 (for retry testing) |
| `org-service` | `org-service` | Organization-level visibility |
| `project-service` | `project-service` | Project-level visibility |
| `public-service` | `public-service` | Public visibility |
| `proxy-service` | `proxy-service` | Proxies to metadata endpoint |
| `project-level-server` | `service-to-service/project-level/server` | Server for service-to-service test |
| `project-level-client` | `service-to-service/project-level/client` | Client for service-to-service test |

### Phase 2: Cluster Verification Scripts

All scripts require the SSH tunnel to be running (`sh ssh-tunnel-dev-dp.sh <username>`).

```bash
# Cross-node communication (5 min monitoring)
bash scripts/cluster/cross-node-test.sh

# Hubble observability (CLI + Prometheus)
bash scripts/cluster/hubble-observability-test.sh

# Transparent encryption (WireGuard)
bash scripts/cluster/transparent-encryption-test.sh
```

| Script | What It Tests | Duration |
|---|---|---|
| `cross-node-test.sh` | HTTP requests between pods on different nodes aren't dropped | ~5 min |
| `hubble-observability-test.sh` | Hubble L7 flow observation and Prometheus metrics export | ~15 sec |
| `transparent-encryption-test.sh` | WireGuard encryption is active on all nodes | ~30 sec |

Each script has a detailed README in `scripts/cluster/`:
- [Cross-Node Test](scripts/cluster/README-cross-node-test.md)
- [Hubble Observability Test](scripts/cluster/README-hubble-observability-test.md)
- [Transparent Encryption Test](scripts/cluster/README-transparent-encryption-test.md)

## Directory Structure

```
verification/
  .env.example              # Config template (committed)
  .env                      # Your config (gitignored)
  playwright.config.ts      # Playwright settings
  auth/
    storage-state.json      # Saved browser session (gitignored)
  src/
    config/
      env.ts                # Loads and validates .env
      components.ts         # 7 component definitions
    helpers/
      auth.ts               # Google SSO login helper
      navigation.ts         # Choreo page navigation
      component-creator.ts  # Core UI automation logic
    tests/
      setup-auth.spec.ts    # Login test (headed, manual SSO)
      create-components.spec.ts  # Component creation tests
  scripts/
    setup.sh                # Install dependencies
    login.sh                # Browser login
    create-all.sh           # Create all components
    create-one.sh           # Create single component
    cluster/
      common.sh             # Shared config (proxy, colors, cluster verify)
      cross-node-test.sh    # Cross-node request drop test
      hubble-observability-test.sh  # Hubble CLI + Prometheus check
      transparent-encryption-test.sh  # WireGuard validation
  test-results/             # Screenshots/videos on failure (gitignored)
```

## Troubleshooting

### Playwright login session expired
Re-run `npm run login` to get a fresh session.

### kubectl: "no such host" error
The AKS cluster is private. Make sure the SSH tunnel is running:
```bash
sh ssh-tunnel-dev-dp.sh <username>
export HTTPS_PROXY=http://localhost:3129
kubectl get nodes
```

### Playwright selectors fail after Choreo UI update
The component creation script relies on UI element selectors that may change. Run Playwright's codegen tool to discover new selectors:
```bash
npx playwright codegen https://consolev2.preview-dv.choreo.dev
```
Update selectors in `src/helpers/component-creator.ts`.

### Cluster script fails with "command not found: _encode"
This is harmless noise from the shell profile. The scripts still work correctly — these warnings come from zsh plugins and don't affect execution.
