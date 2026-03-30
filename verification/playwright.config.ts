import { defineConfig } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const authFile = path.resolve(__dirname, "auth", "storage-state.json");

export default defineConfig({
  testDir: "./src/tests",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: "list",

  use: {
    baseURL: process.env.CHOREO_CONSOLE_URL,
    storageState: authFile,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },

  outputDir: "./test-results",

  projects: [
    {
      name: "auth-setup",
      testMatch: "setup-auth.spec.ts",
      use: {
        storageState: undefined, // no existing auth for login
        headless: false,
      },
    },
    {
      name: "create-components",
      testMatch: "create-components.spec.ts",
      use: {
        headless: true,
      },
    },
  ],
});
