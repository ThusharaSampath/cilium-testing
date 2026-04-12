import { test, expect } from "@playwright/test";
import { config } from "../config/env.js";
import { captureStsToken } from "../helpers/token-capturer.js";
import {
  captureDeploymentDetails,
  pollBuildStatus,
  type ComponentBuildInfo,
  type CapturedBuildDetails,
} from "../helpers/build-poller.js";
import { handleGoogleReloginIfNeeded } from "../helpers/google-relogin.js";

const componentNames = (process.env.POLL_COMPONENTS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

test(`Poll builds for: ${componentNames.join(", ") || "(none)"}`, async ({
  page,
}) => {
  expect(
    componentNames.length,
    "POLL_COMPONENTS env var must be set (comma-separated component names)"
  ).toBeGreaterThan(0);

  // Step 1: Capture STS token (intercepts sts.choreo.dev response)
  const token = await captureStsToken(page);

  // Step 2: For each component, navigate to its overview page briefly
  // to capture componentId and versionId from the deploymentStatusByVersion call
  const buildInfos: ComponentBuildInfo[] = [];

  for (const name of componentNames) {
    const componentUrl = `${config.projectUrl}/components/${name}`;
    const overviewUrl = `${componentUrl}/overview`;

    console.log(`\nCapturing build details for: ${name}`);

    // Set up interception BEFORE navigating
    const detailsPromise = captureDeploymentDetails(page, name, componentUrl);

    await page.goto(overviewUrl);
    await page.waitForLoadState("networkidle");
    await handleGoogleReloginIfNeeded(page);

    const details = await detailsPromise;

    buildInfos.push({
      name,
      componentId: details.componentId,
      versionId: details.versionId,
      componentUrl,
    });
  }

  // Step 3: Poll build status using direct fetch (no browser needed)
  const capturedDetails: CapturedBuildDetails = {
    token,
    apiUrl: config.graphqlUrl,
    components: buildInfos,
  };

  await pollBuildStatus(capturedDetails, 30_000, config.buildWaitMs);
});
