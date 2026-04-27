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
- `kubectl` (and `oc` if targeting OpenShift) installed locally.
- Your shell must already be configured to reach the target PDP cluster — for example
  - `export KUBECONFIG=/path/to/kubeconfig`
  - `oc login ...` for OpenShift
- Verify with `kubectl cluster-info` before running the scripts.

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
CHOREO_PROJECT_HANDLER=<your-project-name>
GITHUB_REPO_NAME=ThusharaSampath/cilium-testing
GITHUB_BRANCH=main
```

## Running Tests

### Phase 1: Login and Create Components

```bash
# Step 1: Login (one-time, opens browser for manual Google SSO)
npm run login
```

### Phase 2: E2E Flows (recommended)

Two E2E flows automate component creation and guide you through the remaining steps:

**Tester Flow** — creates 5 components, then prints next steps:
```bash
npm run e2e:tester
# After builds succeed in Choreo, follow the printed instructions:
#   1. npm run collect:urls
#   2. npm run update:config
#   3. npm run full-test
```

**Service-to-Service Flow** — creates server + client with connection, then prints manual steps:
```bash
npm run e2e:s2s
# After builds succeed in Choreo, follow the printed instructions:
#   1. Copy connection resourceRef from Choreo console
#   2. Update client's .choreo/component.yaml
#   3. Commit, push, rebuild
#   4. npm run full-test
```

**Full Test** — runs both tester and s2s client test consoles with combined report:
```bash
npm run full-test
```

### Phase 3: Individual Steps (alternative to E2E)

```bash
# Create all test components
npm run create:all

# Or create one specific component
bash scripts/create-one.sh error-responder

# Collect endpoint URLs from deployed components
npm run collect:urls

# Update tester env vars and redeploy
npm run update:config

# Run tester test console only
npm run test:console
```

Available components:

| Component | Source Directory | Purpose |
|---|---|---|
| `error-responder` | `error-responder` | Returns HTTP 500 (for retry testing) |
| `org-service` | `org-service` | Organization-level visibility |
| `project-service` | `project-service` | Project-level visibility |
| `public-service` | `public-service` | Public visibility |
| `tester` | `tester` | Central test service calling all others |
| `react-single-page-app` | `react-single-page-app` | React webapp for reachability testing |
| `project-level-server` | `service-to-service/project-level/server` | Server for service-to-service test |
| `project-level-client` | `service-to-service/project-level/client` | Client for service-to-service test |

### Phase 4: Cluster Verification Scripts

All scripts require your shell to already have `kubectl` access to the target cluster (verify with `kubectl cluster-info`).

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
      google-relogin.ts     # Auto re-login on session expiry
      navigation.ts         # Choreo page navigation
      component-creator.ts  # Core UI automation logic
      connection-creator.ts # Service connection creation
      url-collector.ts      # Extracts endpoint URLs from component pages
      tester-config-updater.ts  # Updates tester env vars via deploy wizard
      test-console-runner.ts    # Executes test console and returns response
      build-poller.ts       # GraphQL build status polling (available for future use)
    tests/
      setup-auth.spec.ts        # Login test (headed, manual SSO)
      create-components.spec.ts # Component creation tests
      create-connections.spec.ts # Connection creation tests
      collect-urls.spec.ts      # Collect endpoint URLs
      update-tester-config.spec.ts # Update tester env config
      test-console.spec.ts      # Invoke tester test console
      e2e-tester.spec.ts        # E2E: create tester components + next steps
      e2e-s2s.spec.ts           # E2E: create s2s components + manual steps
      full-test.spec.ts         # Full test: tester + s2s with combined report
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

### kubectl: "no such host" or connection-refused error
Your shell isn't reaching the target cluster. Check:
- `kubectl config current-context` matches the target cluster.
- For private clusters reached via an SSH tunnel: ensure the tunnel is up and `HTTPS_PROXY` is exported.
- For OpenShift: ensure `oc login ...` has been run.
- Confirm with `kubectl cluster-info`.

### Playwright selectors fail after Choreo UI update
The component creation script relies on UI element selectors that may change. Run Playwright's codegen tool to discover new selectors:
```bash
npx playwright codegen https://consolev2.preview-dv.choreo.dev
```
Update selectors in `src/helpers/component-creator.ts`.

### Cluster script fails with "command not found: _encode"
This is harmless noise from the shell profile. The scripts still work correctly — these warnings come from zsh plugins and don't affect execution.
