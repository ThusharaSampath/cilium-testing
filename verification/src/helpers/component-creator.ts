import { type Page } from "@playwright/test";
import { type ComponentDefinition } from "../config/components.js";
import { config } from "../config/env.js";
import { handleGoogleReloginIfNeeded } from "./google-relogin.js";

/**
 * Creates a single component in the Choreo UI via the public GitHub repo flow.
 *
 * Flow based on actual Choreo console screenshots:
 * 1. Navigate to project → "Create a Service" page
 * 2. Click "Use Public GitHub Repository"
 * 3. Fill repo URL → Branch/Directory fields appear
 * 4. Edit Component Directory to the service path
 * 5. Fill Display Name (Name auto-populates)
 * 6. Select Build Preset (Go)
 * 7. Click "Create and Deploy"
 */
export async function createComponent(
  page: Page,
  component: ComponentDefinition
): Promise<string> {
  console.log(`\nCreating component: ${component.name}`);
  console.log(`  Directory: ${component.sourceDirectory}`);
  console.log(`  Build preset: ${component.buildPreset}`);

  // Step 1: Navigate to the "Create a Service" page
  // The URL pattern from screenshots: .../create-list then select Service
  await page.goto(`${config.projectUrl}/home`);
  await page.waitForLoadState("networkidle");
  await handleGoogleReloginIfNeeded(page);

  // Click "Create" button on the project home
  const createButton = page.getByRole("button", { name: /create/i }).first();
  await createButton.waitFor({ state: "visible", timeout: 30_000 });
  await createButton.click();
  await page.waitForLoadState("networkidle");

  // Select component type (Service or Web Application)
  const componentType = component.componentType ?? "Service";
  await page.getByText(componentType, { exact: true }).first().click();
  await page.waitForLoadState("networkidle");

  // Step 2: Click "Use Public GitHub Repository"
  await page
    .getByText("Use Public GitHub Repository")
    .click({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");

  // Step 3: Fill the Public Repository URL
  const repoUrl = `https://github.com/${config.githubRepo}`;
  const repoInput = page.getByPlaceholder("https://github.com/org/repo");
  await repoInput.waitFor({ state: "visible", timeout: 15_000 });
  await repoInput.fill(repoUrl);
  // Press Enter or Tab to trigger the URL validation/fetch
  await repoInput.press("Enter");

  // Wait for the "Edit" button next to Component Directory to appear
  // This indicates the repo URL was validated and branch/directory loaded
  const editButton = page.locator('#page-scroll-container').getByText("Edit");
  await editButton.waitFor({ state: "visible", timeout: 30_000 });

  // Step 4: Edit Component Directory via the directory picker dialog
  await editButton.click();

  // Wait for the dialog to appear and scope all interactions to it
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 10_000 });

  // Search for the last segment of the directory path
  // e.g., "server" for "service-to-service/project-level/server"
  const searchTerm = component.sourceDirectory.split("/").pop()!;
  const searchInput = dialog.getByPlaceholder("Search Directories");
  await searchInput.waitFor({ state: "visible", timeout: 10_000 });
  await searchInput.fill(searchTerm);

  // Wait for search results to filter
  await page.waitForTimeout(1000);

  // Click the matching folder in the tree
  // The tree shows the full path (e.g., "service-to-service/project-level/server")
  // For top-level dirs it shows just the name (e.g., "proxy-service")
  const folderItem = dialog.getByText(component.sourceDirectory, {
    exact: true,
  });
  await folderItem.click({ timeout: 10_000 });

  // Click "Continue" to confirm the directory selection
  await dialog.getByRole("button", { name: "Continue" }).click();

  // Wait for dialog to close and the page to update
  await page.waitForTimeout(2000);
  await page.waitForLoadState("networkidle");

  // Step 5: Display Name and Name are auto-filled from the directory name

  // Step 6: Select Build Preset (Go, Docker, React, etc.)
  await page.getByText(component.buildPreset, { exact: true }).click();

  // Step 6b: Fill web app-specific fields (Build Command, Build Path, Node Version)
  if (component.buildCommand) {
    const buildCommandInput = page.getByPlaceholder(/npm run build/i);
    await buildCommandInput.fill(component.buildCommand);
  }
  if (component.buildPath) {
    const buildPathInput = page.getByPlaceholder(/\/build/);
    await buildPathInput.fill(component.buildPath);
  }
  if (component.nodeVersion) {
    const nodeVersionInput = page.getByPlaceholder(/18/);
    await nodeVersionInput.fill(component.nodeVersion);
  }

  // Step 7: Click "Create and Deploy"
  await page
    .getByRole("button", { name: "Create and Deploy" })
    .click({ timeout: 15_000 });

  // Wait for the UI to auto-redirect to the newly created component's overview page.
  // The component slug is auto-generated, so we must wait for the redirect
  // and extract the URL rather than constructing it ourselves.
  // Note: We wait for /overview specifically because the create page URL already
  // contains /components/new/, so a generic /components/** match resolves immediately.
  await page.waitForURL("**/components/*/overview", { timeout: 120_000 });
  await page.waitForLoadState("networkidle");

  // Extract the component base URL from the current page URL
  // URL pattern: .../projects/{project}/components/{auto-generated-slug}/...
  const currentUrl = page.url();
  const componentsMatch = currentUrl.match(/(.*\/components\/[^/]+)/);
  if (!componentsMatch) {
    throw new Error(
      `Failed to extract component URL after creation. Current URL: ${currentUrl}`
    );
  }
  const componentUrl = componentsMatch[1];

  console.log(`  Component created successfully: ${component.name}`);
  console.log(`  Component URL: ${componentUrl}`);

  if (component.note) {
    console.log(`  NOTE: ${component.note}`);
  }

  return componentUrl;
}
