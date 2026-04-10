# tools-and-utils

This repository contains tools and services for verifying Cilium compatibility on WSO2 Choreo dataplanes. It includes test service source code and Playwright-based UI automation to create those services as Choreo components.

## Repository Structure

| Directory | Description |
|---|---|
| `error-responder/` | Go service that always returns HTTP 500 (for HTTP retry testing) |
| `org-service/` | Go service with Organization-level network visibility |
| `project-service/` | Go service with Project-level network visibility |
| `public-service/` | Go service with Public network visibility |
| `proxy-service/` | Go reverse proxy (defaults to metadata endpoint `169.254.169.254`) |
| `service-to-service/` | Client + Server pair for project-level service-to-service communication |
| `cross-node-request-drop-test.yaml` | K8s DaemonSet manifest for cross-node request reliability testing |
| `tester/` | Central test service that calls org, public, project services and webapp |
| `react-single-page-app/` | React webapp for reachability testing |
| `verification/` | Playwright automation + cluster scripts for end-to-end verification |

## Prerequisites

- **Node.js** >= 18 and **npm**
- **Google account** with access to the target Choreo organization
- The GitHub repo `ThusharaSampath/cilium-testing` must be connected/authorized in the Choreo org
- A **project** must already exist in the Choreo org (the automation creates components inside it)

## Setup

```bash
cd verification

# Install dependencies and Chromium browser
bash scripts/setup.sh
```

This will:
1. Run `npm install` for Playwright, TypeScript, and dotenv
2. Download Chromium for Playwright
3. Create a `.env` file from `.env.example` if one doesn't exist

After setup, edit `verification/.env` with your Choreo org and project details:

```
CHOREO_CONSOLE_URL=https://consolev2.preview-dv.choreo.dev
CHOREO_ORG_HANDLE=<your-org-handle>
CHOREO_PROJECT_NAME=<your-project-name>
GITHUB_REPO_NAME=ThusharaSampath/cilium-testing
GITHUB_BRANCH=main
```

## Usage

All commands are run from the `verification/` directory.

### 1. Login (one-time)

```bash
npm run login
```

Opens a headed Chromium browser. Complete the Google SSO login manually. Once you land on the Choreo dashboard, the script saves your session to `auth/storage-state.json` so subsequent runs skip login. Re-run this if your session expires.

### 2. E2E Flows (recommended)

```bash
# Create tester components (org, public, project, webapp, tester)
# Prints next steps after creation
npm run e2e:tester

# Create service-to-service components (server + client with connection)
# Prints manual steps after creation
npm run e2e:s2s

# Run full verification (tester + s2s client test consoles with combined report)
npm run full-test
```

### 3. Individual Steps

```bash
# Create all components
npm run create:all

# Collect endpoint URLs from component overview pages
npm run collect:urls

# Update tester env config and redeploy
npm run update:config

# Invoke tester /test endpoint via test console
npm run test:console
```

### Scripts Reference

| Script | Description |
|---|---|
| `npm run e2e:tester` | E2E: Create tester flow components, prints next steps |
| `npm run e2e:s2s` | E2E: Create s2s components + connection, prints manual steps |
| `npm run full-test` | Run tester + s2s client test consoles with combined pass/fail report |
| `npm run create:all` | Creates all test components |
| `npm run collect:urls` | Extracts endpoint URLs from deployed components |
| `npm run update:config` | Updates tester env vars and triggers redeploy |
| `npm run test:console` | Invokes tester /test endpoint via Choreo test console |

## Notes

- The `project-level-client` component requires a **server-connection** to be configured manually in Choreo after creation.
- UI selectors in `verification/src/helpers/component-creator.ts` may need adjustment if the Choreo console UI changes. Run `npx playwright codegen <choreo-url>` to discover updated selectors.
- Screenshots and videos are captured on failure to `verification/test-results/` for debugging.
