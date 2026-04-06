import { test, expect } from "@playwright/test";
import { config } from "../config/env.js";
import { handleGoogleReloginIfNeeded } from "../helpers/google-relogin.js";

test("invoke /test endpoint from tester component test console", async ({
  page,
}) => {
  // Navigate directly to the tester component's test console
  const testConsoleUrl = `${config.projectUrl}/components/tester/test/console`;
  await page.goto(testConsoleUrl);
  await page.waitForLoadState("networkidle");
  await handleGoogleReloginIfNeeded(page);

  // Click on the /test API resource row to expand it
  const expandButton = page.locator('button[aria-label="get ​/test"]');
  await expandButton.waitFor({ state: "visible", timeout: 30_000 });
  await expandButton.click();

  // Click "Try it out" button
  await page.getByRole("button", { name: "Try it out" }).click();

  // Click "Execute" button
  await page.getByRole("button", { name: "Execute" }).click();

  // Wait for the response body to appear (increase timeout for slow API calls)
  await page.waitForSelector("text=Response body", { timeout: 120_000 });

  // Extract the response body (first .microlight under "Response body" label)
  const responseBody = await page
    .locator(".response-col_description .microlight")
    .first()
    .textContent();

  console.log("=== Test Console Response ===");
  console.log(responseBody);
  console.log("=== End Response ===");

  // Parse and validate the response
  expect(responseBody).toBeTruthy();
  const parsed = JSON.parse(responseBody!);
  expect(parsed.service).toBe("tester");
  expect(parsed.results).toBeInstanceOf(Array);
  expect(parsed.results.length).toBe(3);

  // Log individual service results
  for (const result of parsed.results) {
    const status = result.error ? `ERROR: ${result.error}` : `OK (${result.status})`;
    console.log(`  ${result.name}: ${status}`);
  }
});
