import { test } from "@playwright/test";
import { waitForManualLogin } from "../helpers/auth.js";
import path from "path";

const authFile = path.resolve(__dirname, "../../auth/storage-state.json");

test("authenticate via Google SSO", async ({ page, context }) => {
  await waitForManualLogin(page);

  // Save auth state for subsequent runs
  await context.storageState({ path: authFile });
  console.log(`Auth state saved to ${authFile}`);
});
