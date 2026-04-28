# Cilium Verification Toolbox

This repository validates Cilium CNI compatibility on WSO2 Choreo dataplanes. It contains the test service source code, GraphQL/Playwright automation that drives Choreo, and `kubectl`-based cluster checks.

## Repository Structure

| Directory | Description |
|---|---|
| `org-service/` | Go service with Organization-level network visibility |
| `project-service/` | Go service with Project-level network visibility |
| `public-service/` | Go service with Public network visibility |
| `service-to-service/` | Client + Server pair for project-level service-to-service communication |
| `tester/` | Central test service that calls org, public, project services and webapp |
| `react-single-page-app/` | React webapp for reachability testing |
| `verification/` | Automation + cluster scripts for end-to-end verification |

## Prerequisites

- **Node.js** >= 18 and **npm**
- **Google account** with access to the target Choreo organization
- The GitHub repo containing the test services must be connected/authorized in the Choreo org (set via `GITHUB_REPO_NAME` in `.env`)
- A **project** must already exist in the Choreo org (the automation creates components inside it)
- For cluster scripts: a shell with `kubectl` already configured to reach the target PDP cluster

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

After setup, edit `verification/.env` with your Choreo org and project details. See `verification/README.md` for the full env-var reference.

## Usage

The canonical entry point is `bash scripts/verify.sh`. It orchestrates three tracks (Infra → Tester → S2S → final report) with state-tracked resumability.

```bash
cd verification

# One-time Google SSO login (saves session to auth/storage-state.json)
npm run login

# Full verification — interactive menu for which tracks to run
bash scripts/verify.sh

# Reset persisted state and start over
bash scripts/verify.sh --reset
```

See `verification/README.md` and `verification/verification-steps.md` for what each track covers and how to run individual pieces.

## Notes

- Screenshots and videos are captured on failure to `verification/test-results/` for debugging.
- If the Choreo console UI changes, run `npx playwright codegen <choreo-url>` to discover updated selectors for the connection-creator helper.
