import { type Page } from "@playwright/test";
import { type ConnectionDefinition } from "../config/components.js";
import { handleGoogleReloginIfNeeded } from "./google-relogin.js";

/**
 * Creates a connection for a component in the Choreo UI.
 *
 * Flow (from Playwright codegen recording, April 2026):
 * 1. Navigate to the component's Connections page
 * 2. Click "Service Connection" button
 * 3. Search for target service and select it
 * 4. Fill in the connection name
 * 5. Click "Create"
 *
 * @param componentUrl - The base URL of the component
 *                       (e.g., .../components/auto-generated-slug)
 */
export async function createConnection(
  page: Page,
  componentUrl: string,
  connection: ConnectionDefinition
): Promise<void> {
  console.log(`\nCreating connection: ${connection.name}`);
  console.log(`  Target service: ${connection.targetServiceName}`);

  // Step 1: Navigate to the component's Connections page
  await page.goto(`${componentUrl}/connections`);
  await page.waitForLoadState("networkidle");
  await handleGoogleReloginIfNeeded(page);

  // Check if connection already exists (idempotency)
  const existingConnection = page.getByText(connection.name, { exact: true });
  if (await existingConnection.isVisible({ timeout: 3_000 }).catch(() => false)) {
    console.log(`  Connection "${connection.name}" already exists — skipping.`);
    return;
  }

  // Step 2: Click "Service Connection" button
  await page
    .getByRole("button", { name: /Service Connection/i })
    .click({ timeout: 15_000 });

  // Step 3: Search for the target service and click it
  const searchInput = page.getByRole("textbox", { name: "Search resources" });
  await searchInput.waitFor({ state: "visible", timeout: 15_000 });
  await searchInput.fill(connection.targetServiceName);
  await page.waitForTimeout(2000);

  // Click the matching service button
  await page
    .getByRole("button", { name: new RegExp(connection.targetServiceName, "i") })
    .first()
    .click({ timeout: 15_000 });

  // Step 4: Fill in the connection name
  const nameInput = page.getByRole("textbox", { name: "Name" });
  await nameInput.waitFor({ state: "visible", timeout: 15_000 });
  await nameInput.fill(connection.name);

  // Step 5: Click "Create" to finalize the connection
  await page
    .getByRole("button", { name: "Create" })
    .click({ timeout: 15_000 });

  // Wait for navigation away from the creation form
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  console.log(`  Connection created successfully: ${connection.name}`);
  console.log(
    `  NOTE: Copy the dependencies snippet from the UI and update the component.yaml if needed`
  );
}
