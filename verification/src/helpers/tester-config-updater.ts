import { Page } from "@playwright/test";
import { config } from "../config/env.js";
import { handleGoogleReloginIfNeeded } from "./google-relogin.js";

/**
 * Updates the tester component's env var config and triggers a redeploy.
 *
 * Flow (from Playwright codegen recording, April 2026):
 * 1. Navigate to tester deploy page
 * 2. Open "Configure & Deploy" via the deploy option dropdown
 * 3. Click "Configure & Deploy" button to enter wizard
 * 4. Expand "Optional" section to reveal env var fields
 * 5. Fill env var textboxes
 * 6. Click "Next" 4 times to complete the wizard
 */
export async function updateTesterConfig(
  page: Page,
  urls: Record<string, string>
): Promise<void> {
  console.log("[tester-config] Starting tester config update");
  console.log("[tester-config] URLs to set:");
  for (const [key, value] of Object.entries(urls)) {
    console.log(`  ${key} = ${value}`);
  }

  // Navigate to tester component deploy page
  const deployUrl = `${config.projectUrl}/components/tester/deploy`;
  console.log(`[tester-config] Navigating to: ${deployUrl}`);
  await page.goto(deployUrl);
  await page.waitForLoadState("networkidle");
  console.log(`[tester-config] Page loaded. Current URL: ${page.url()}`);
  await handleGoogleReloginIfNeeded(page);
  console.log(`[tester-config] After relogin check. Current URL: ${page.url()}`);
  await page.waitForTimeout(2000);

  // Open "Configure & Deploy" via the deploy option dropdown
  console.log('[tester-config] Looking for "Select deploy option" button...');
  const deployOptionBtn = page.getByRole("button", { name: "Select deploy option" });
  console.log(`[tester-config]   visible: ${await deployOptionBtn.isVisible({ timeout: 5_000 }).catch(() => false)}`);
  await deployOptionBtn.click({ timeout: 15_000 });
  console.log('[tester-config] Clicked "Select deploy option"');

  console.log('[tester-config] Looking for "Configure & Deploy" menuitem...');
  const configMenuItem = page.getByRole("menuitem", { name: "Configure & Deploy" });
  console.log(`[tester-config]   visible: ${await configMenuItem.isVisible({ timeout: 5_000 }).catch(() => false)}`);
  await configMenuItem.click({ timeout: 15_000 });
  console.log('[tester-config] Clicked "Configure & Deploy" menuitem');

  // Click "Configure & Deploy" button to enter the config wizard
  console.log('[tester-config] Looking for "Configure & Deploy" button...');
  const configDeployBtn = page.getByRole("button", { name: "Configure & Deploy" });
  console.log(`[tester-config]   visible: ${await configDeployBtn.isVisible({ timeout: 5_000 }).catch(() => false)}`);
  await configDeployBtn.click({ timeout: 15_000 });
  console.log('[tester-config] Clicked "Configure & Deploy" button');

  // Expand the "Optional" section to reveal the env var fields
  console.log('[tester-config] Looking for "Optional" button...');
  const optionalBtn = page.getByRole("button", { name: "Optional" });
  console.log(`[tester-config]   visible: ${await optionalBtn.isVisible({ timeout: 5_000 }).catch(() => false)}`);
  await optionalBtn.click({ timeout: 15_000 });
  console.log('[tester-config] Clicked "Optional" button');

  // Fill in the env var fields using role-based selectors
  const fields = [
    { label: "Org Service URL", envVar: "ORG_SERVICE_URL" },
    { label: "Public Service URL", envVar: "PUBLIC_SERVICE_URL" },
    { label: "Project Service URL", envVar: "PROJECT_SERVICE_URL" },
    { label: "Webapp URL", envVar: "WEBAPP_URL" },
  ];

  for (const field of fields) {
    const value = urls[field.envVar];
    if (!value) {
      console.warn(`[tester-config] Skipping ${field.envVar}: no URL collected`);
      continue;
    }
    console.log(`[tester-config] Looking for textbox "${field.label}"...`);
    const input = page.getByRole("textbox", { name: field.label });
    const visible = await input.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log(`[tester-config]   visible: ${visible}`);
    if (!visible) {
      // Debug: list all visible textboxes on the page
      const allTextboxes = page.getByRole("textbox");
      const count = await allTextboxes.count();
      console.log(`[tester-config]   DEBUG: Found ${count} textboxes on page:`);
      for (let i = 0; i < count; i++) {
        const tb = allTextboxes.nth(i);
        const name = await tb.getAttribute("name").catch(() => "?");
        const id = await tb.getAttribute("id").catch(() => "?");
        const placeholder = await tb.getAttribute("placeholder").catch(() => "?");
        const ariaLabel = await tb.getAttribute("aria-label").catch(() => "?");
        console.log(`[tester-config]     [${i}] name="${name}" id="${id}" placeholder="${placeholder}" aria-label="${ariaLabel}"`);
      }
    }
    await input.click({ timeout: 15_000 });
    await input.fill(value);
    console.log(`[tester-config] Filled "${field.label}" = ${value}`);
  }

  // Click "Next" 3 times, then "Deploy" (all share data-testid="btn-next")
  const stepLabels = ["Next (1/3)", "Next (2/3)", "Next (3/3)", "Deploy"];
  for (let i = 0; i < stepLabels.length; i++) {
    const label = stepLabels[i];
    console.log(`[tester-config] Clicking "${label}"...`);
    const nextBtn = page.getByTestId("btn-next");
    const visible = await nextBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    const btnText = visible ? await nextBtn.textContent().catch(() => "?") : "not visible";
    console.log(`[tester-config]   btn-next visible: ${visible}, text: "${btnText}"`);
    await nextBtn.click({ timeout: 15_000 });
    console.log(`[tester-config] Clicked "${label}"`);
    await page.waitForTimeout(1000);
  }

  // Wait for the deploy API call to complete before browser teardown
  console.log("[tester-config] Waiting for deploy to be accepted...");
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
  await page.waitForTimeout(5_000);
  console.log(`[tester-config] Current URL after deploy: ${page.url()}`);

  console.log("[tester-config] Tester config updated and deploy triggered.");
}
