import { test, expect } from "@playwright/test";
import { captureStsToken } from "../helpers/token-capturer.js";

test("Capture STS token", async ({ page }) => {
  const token = await captureStsToken(page);
  expect(token).toBeTruthy();
  console.log(`Token captured successfully (length: ${token.length})`);
  console.log(`Token prefix: ${token.substring(0, 50)}...`);
});
