import { type Page } from "@playwright/test";
import { config } from "../config/env.js";

/**
 * Waits for the user to complete Google SSO login manually in the headed browser.
 * Navigates to the Choreo console and waits until the dashboard loads.
 */
export async function waitForManualLogin(page: Page): Promise<void> {
  await page.goto(config.consoleUrl);

  // Wait for the user to complete SSO — detected by URL containing /organizations/
  console.log("\n========================================");
  console.log("Complete Google SSO login in the browser.");
  console.log("The script will continue automatically after login.");
  console.log("========================================\n");

  await page.waitForURL(`**/organizations/${config.orgHandle}/**`, {
    timeout: 180_000, // 3 minutes for manual login
  });

  console.log("Login successful!");
}
