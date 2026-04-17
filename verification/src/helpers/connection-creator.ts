import { type Page } from "@playwright/test";
import { type ConnectionDefinition } from "../config/components.js";
import { handleGoogleReloginIfNeeded } from "./google-relogin.js";
import { config } from "../config/env.js";
import { loadToken } from "./token-loader.js";

const CONNECTIONS_API_URL = "https://apis.choreo.dev/connections/v1.0/configurations/service-configs/connections";

/**
 * Fetches existing connections for a component via the REST API.
 * Returns a Set of connection names that already exist.
 */
export async function fetchExistingConnections(
  componentId: string
): Promise<Set<string>> {
  const token = loadToken();
  const url = `${CONNECTIONS_API_URL}?projectId=${config.projectId}&componentId=${componentId}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      Origin: "https://console.choreo.dev",
      Referer: "https://console.choreo.dev/",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Connections API HTTP ${response.status}: ${text}`);
  }

  const connections: { name: string }[] = await response.json();
  const names = new Set(connections.map((c) => c.name));
  console.log(
    `  Existing connections: ${names.size > 0 ? [...names].join(", ") : "(none)"}`
  );
  return names;
}

/**
 * Resolves the componentId for a given component handler name via GraphQL.
 */
export async function getComponentId(componentHandler: string): Promise<string> {
  const token = loadToken();

  const response = await fetch(config.graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      Origin: "https://console.choreo.dev",
      Referer: "https://console.choreo.dev/",
    },
    body: JSON.stringify({
      query: `query {
        components(orgHandler: "${config.orgHandle}", projectId: "${config.projectId}") {
          id
          handler
        }
      }`,
    }),
  });

  const json = await response.json();
  const comp = (json.data?.components ?? []).find(
    (c: any) => c.handler === componentHandler
  );
  if (!comp) {
    throw new Error(`Component "${componentHandler}" not found`);
  }
  return comp.id;
}

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

/**
 * Creates multiple connections for a component on a single page load.
 *
 * Navigates to the connections page once, then creates each connection
 * sequentially by using the Create button and closing the success dialog
 * to return to the connections list.
 */
export async function createConnections(
  page: Page,
  componentUrl: string,
  connections: ConnectionDefinition[]
): Promise<void> {
  // Navigate to connections page once
  await page.goto(`${componentUrl}/connections`);
  await page.waitForLoadState("networkidle");
  await handleGoogleReloginIfNeeded(page);

  for (const connection of connections) {
    console.log(`\nCreating connection: ${connection.name}`);
    console.log(`  Target service: ${connection.targetServiceName}`);

    // Click "Create" button on the connections page
    await page
      .getByRole("button", { name: "Create" })
      .click({ timeout: 15_000 });

    // Select "Service" resource type
    await page
      .getByTestId("resource-type-service")
      .click({ timeout: 15_000 });

    // Search for the target service and click it
    const searchInput = page.getByRole("textbox", { name: "Search resources" });
    await searchInput.waitFor({ state: "visible", timeout: 15_000 });
    await searchInput.fill(connection.targetServiceName);
    await page.waitForTimeout(2000);

    await page
      .getByRole("button", { name: new RegExp(connection.targetServiceName, "i") })
      .first()
      .click({ timeout: 15_000 });

    // Fill in the connection name
    const nameInput = page.getByRole("textbox", { name: "Name" });
    await nameInput.waitFor({ state: "visible", timeout: 15_000 });
    await nameInput.fill(connection.name);

    // Click "Create" to finalize
    await page
      .getByRole("button", { name: "Create" })
      .click({ timeout: 15_000 });

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    console.log(`  Connection created successfully: ${connection.name}`);

    // Close the success dialog to return to connections page
    await page
      .getByTestId("sample-creation-dialog-closeBtn")
      .click({ timeout: 15_000 });

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
  }

  console.log(`\nAll connections processed.`);
}
