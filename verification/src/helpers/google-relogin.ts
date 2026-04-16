import { type Page } from "@playwright/test";
import { config } from "../config/env.js";

/**
 * Handles Google account chooser re-login if the session has expired.
 * Should be called after navigating to a Choreo page.
 * If the page redirected to Google sign-in, clicks the configured account.
 * If already on Choreo, this is a no-op.
 */
export async function handleGoogleReloginIfNeeded(
  page: Page
): Promise<void> {
  // Wait briefly for any redirect to settle (Choreo → Asgardeo → Google)
  await page.waitForTimeout(2000);

  // Check if we landed on a Google sign-in page
  if (!page.url().includes("accounts.google.com")) {
    return;
  }

  console.log("Session expired — re-authenticating via Google account chooser...");

  // Click the configured Google account
  const accountLink = page.getByRole("link", {
    name: new RegExp(config.googleAccountName, "i"),
  });
  await accountLink.waitFor({ state: "visible", timeout: 15_000 });
  await accountLink.click();

  // Wait for redirect back to Choreo
  await page.waitForURL(`${config.consoleUrl}/**`, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");

  console.log("Re-authentication successful.");
}
