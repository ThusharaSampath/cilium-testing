import { type Page } from "@playwright/test";
import { config } from "../config/env.js";
import { handleGoogleReloginIfNeeded } from "./google-relogin.js";

export async function navigateToProject(page: Page): Promise<void> {
  await page.goto(`${config.projectUrl}/home`);
  await page.waitForLoadState("networkidle");
  await handleGoogleReloginIfNeeded(page);
}

export async function navigateToComponentCreation(page: Page): Promise<void> {
  await navigateToProject(page);

  // Click "Create" or "Create Component" button on the project page
  // Try common patterns — Choreo UI may use different text
  const createButton = page.getByRole("button", { name: /create/i }).first();
  await createButton.waitFor({ state: "visible", timeout: 30_000 });
  await createButton.click();
}
