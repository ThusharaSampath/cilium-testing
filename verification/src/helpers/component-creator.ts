import { type Page, expect } from "@playwright/test";
import { type ComponentDefinition } from "../config/components.js";
import { config } from "../config/env.js";

/**
 * Creates a single component in the Choreo UI.
 *
 * NOTE: The selectors below are best-guess based on typical Choreo console patterns.
 * They will likely need adjustment after the first headed run.
 * Run `npx playwright codegen <choreo-url>` to discover actual selectors.
 */
export async function createComponent(
  page: Page,
  component: ComponentDefinition
): Promise<void> {
  console.log(`Creating component: ${component.name}`);

  // Step 1: Navigate to project and click create
  await page.goto(`${config.projectUrl}/home`);
  await page.waitForLoadState("networkidle");

  // Step 2: Click "Create" button to start component creation
  const createButton = page.getByRole("button", { name: /create/i }).first();
  await createButton.waitFor({ state: "visible", timeout: 30_000 });
  await createButton.click();
  await page.waitForLoadState("networkidle");

  // Step 3: Select "Service" as the component type
  // The Choreo UI typically shows cards or buttons for component types
  const serviceOption = page
    .getByRole("button", { name: /service/i })
    .or(page.getByText("Service", { exact: true }))
    .first();
  await serviceOption.waitFor({ state: "visible", timeout: 15_000 });
  await serviceOption.click();

  // Step 4: Select the GitHub repository
  // Look for the repo name in a dropdown or list
  await page
    .getByText(config.githubRepo, { exact: false })
    .first()
    .click({ timeout: 15_000 });

  // Step 5: Select branch
  // Might be auto-selected if there's only main, or need to pick from dropdown
  const branchSelector = page.getByText(config.githubBranch, { exact: false });
  if (await branchSelector.isVisible()) {
    await branchSelector.first().click();
  }

  // Step 6: Enter or select the source directory
  // This could be a text input or a directory browser
  const directoryInput = page
    .getByPlaceholder(/directory/i)
    .or(page.getByLabel(/directory/i))
    .or(page.getByLabel(/path/i))
    .first();

  if (await directoryInput.isVisible()) {
    await directoryInput.fill(component.sourceDirectory);
  } else {
    // Try clicking on the directory in a tree view
    const parts = component.sourceDirectory.split("/");
    for (const part of parts) {
      await page.getByText(part, { exact: true }).first().click();
    }
  }

  // Step 7: Enter the component name
  const nameInput = page
    .getByLabel(/name/i)
    .or(page.getByPlaceholder(/name/i))
    .first();
  await nameInput.waitFor({ state: "visible", timeout: 15_000 });
  await nameInput.clear();
  await nameInput.fill(component.name);

  // Step 8: Click the final "Create" button
  const submitButton = page
    .getByRole("button", { name: /create/i })
    .last();
  await submitButton.click();

  // Step 9: Wait for confirmation — URL should change or a success message appears
  await page.waitForLoadState("networkidle");

  // Give the UI a moment to settle and show the component page
  await page.waitForTimeout(3000);

  console.log(`Component created: ${component.name}`);

  if (component.note) {
    console.log(`  NOTE: ${component.note}`);
  }
}
