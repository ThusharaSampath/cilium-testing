import { type Page } from "@playwright/test";
import { type ConnectionDefinition } from "../config/components.js";
import { handleGoogleReloginIfNeeded } from "./google-relogin.js";

/**
 * Creates a connection for a component in the Choreo UI.
 *
 * Flow based on Choreo console:
 * 1. Navigate to the component's Connections page (derived from componentUrl)
 * 2. Click "Service" to create a service connection
 * 3. Select the target service from the resource list
 * 4. Fill in the connection name
 * 5. Click "Create" to finalize the connection
 *
 * @param componentUrl - The base URL of the component, extracted after auto-redirect
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

  // Step 2: Click "Service" connection type card
  const serviceCard = page.locator('[data-cyid="service-card-button"]');
  await serviceCard.waitFor({ state: "visible", timeout: 30_000 });
  await serviceCard.click();

  // Wait for the "Select a Resource" page to load
  await page.getByText("Select a Resource").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.waitForLoadState("networkidle");

  // Step 3: Search for the target service and click the first matching card
  const searchInput = page.getByPlaceholder("Search Resources");
  await searchInput.waitFor({ state: "visible", timeout: 15_000 });
  await searchInput.fill(connection.targetServiceName);
  await page.waitForTimeout(2000);

  // Click the resource card that has the exact service name in its h4
  const targetCard = page
    .locator(".MuiCardContent-root")
    .filter({ has: page.locator("h4", { hasText: new RegExp(`^${connection.targetServiceName}$`) }) });
  await targetCard.first().waitFor({ state: "visible", timeout: 15_000 });
  await targetCard.first().click();
  await page.waitForLoadState("networkidle");

  // Step 4: Fill in the connection name
  const nameInput = page.getByPlaceholder("Enter Connection Name");
  await nameInput.waitFor({ state: "visible", timeout: 15_000 });
  await nameInput.fill(connection.name);

  // Step 5: Click "Create" to finalize the connection
  await page
    .locator('[data-cyid="connection-create-button"]')
    .click({ timeout: 15_000 });

  // Wait for the connection detail page to load
  await page
    .getByText("How to use the Connection")
    .waitFor({ state: "visible", timeout: 30_000 });

  console.log(`  Connection created successfully: ${connection.name}`);
  console.log(
    `  NOTE: Copy the dependencies snippet from the UI and update the component.yaml if needed`
  );
}
