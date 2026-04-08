import { Page, expect } from "@playwright/test";
import { config } from "../config/env.js";
import { handleGoogleReloginIfNeeded } from "./google-relogin.js";

export async function runTestConsole(
  page: Page,
  componentName: string,
  endpoint: string
): Promise<string> {
  const testConsoleUrl = `${config.projectUrl}/components/${componentName}/test/console`;
  await page.goto(testConsoleUrl);
  await page.waitForLoadState("networkidle");
  await handleGoogleReloginIfNeeded(page);

  // Click on the API resource row to expand it
  const expandButton = page.locator(
    `button[aria-label="get ​${endpoint}"]`
  );
  await expandButton.waitFor({ state: "visible", timeout: 30_000 });
  await expandButton.click();

  // Click "Try it out" button
  await page.getByRole("button", { name: "Try it out" }).click();

  // Click "Execute" button
  await page.getByRole("button", { name: "Execute" }).click();

  // Wait for the response body to appear
  await page.waitForSelector("text=Response body", { timeout: 120_000 });

  // Extract the response body
  const responseBody = await page
    .locator(".response-col_description .microlight")
    .first()
    .textContent();

  console.log(`=== Test Console Response (${componentName}${endpoint}) ===`);
  console.log(responseBody);
  console.log("=== End Response ===");

  expect(responseBody).toBeTruthy();
  return responseBody!;
}
