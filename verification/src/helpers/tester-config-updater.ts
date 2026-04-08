import { Page } from "@playwright/test";
import { config } from "../config/env.js";
import { handleGoogleReloginIfNeeded } from "./google-relogin.js";

export async function updateTesterConfig(
  page: Page,
  urls: Record<string, string>
): Promise<void> {
  console.log("Using URLs:");
  for (const [key, value] of Object.entries(urls)) {
    console.log(`  ${key} = ${value}`);
  }

  // Navigate to tester component deploy page
  const deployUrl = `${config.projectUrl}/components/tester/deploy`;
  await page.goto(deployUrl);
  await page.waitForLoadState("networkidle");
  await handleGoogleReloginIfNeeded(page);

  // Open "Configure & Deploy" via the merge strategy dropdown
  await page.getByRole("button", { name: "select merge strategy" }).click();
  await page.getByRole("menuitem", { name: "Configure & Deploy" }).click();

  // Click "Configure & Deploy" button to enter the config wizard
  await page
    .getByRole("button", { name: "Configure & Deploy" })
    .click();

  // Expand the "Optional" section to reveal the env var fields
  await page.getByRole("button", { name: "Optional" }).click();

  // Fill in the env var fields
  const fields = [
    { id: "Org Service URL", envVar: "ORG_SERVICE_URL" },
    { id: "Public Service URL", envVar: "PUBLIC_SERVICE_URL" },
    { id: "Project Service URL", envVar: "PROJECT_SERVICE_URL" },
    { id: "Webapp URL", envVar: "WEBAPP_URL" },
  ];

  for (const field of fields) {
    const value = urls[field.envVar];
    if (!value) {
      console.warn(`Skipping ${field.envVar}: no URL collected`);
      continue;
    }
    const input = page.locator(`[id="${field.id}"]`);
    await input.click();
    await input.fill(value);
    console.log(`Filled ${field.id} = ${value}`);
  }

  // Click "Next" to proceed through the wizard steps
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-next").click();
  await page.getByTestId("btn-next").click();

  console.log("Tester config updated and deploy triggered.");
}
