import { defineConfig } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const authFile = path.resolve(__dirname, "auth", "storage-state.json");

const buildWaitMs =
  parseInt(process.env.BUILD_WAIT_MINUTES ?? "20") * 60 * 1000;

export default defineConfig({
  testDir: "./src/tests",
  timeout: 240_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: parseInt(process.env.RETRIES ?? "0"),
  reporter: "list",

  use: {
    baseURL: process.env.CHOREO_CONSOLE_URL,
    headless: false,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },

  outputDir: "./test-results",

  projects: [
    {
      name: "auth-setup",
      testMatch: "setup-auth.spec.ts",
      timeout: 180_000, // 3 minutes for manual SSO login
      // No storageState — fresh browser for login
    },
    {
      name: "create-components",
      testMatch: "create-components.spec.ts",
      use: {
        storageState: authFile,
      },
    },
    {
      name: "create-connections",
      testMatch: "create-connections.spec.ts",
      use: {
        storageState: authFile,
      },
    },
    {
      name: "test-console",
      testMatch: "test-console.spec.ts",
      use: {
        storageState: authFile,
      },
    },
    {
      name: "collect-urls",
      testMatch: "collect-urls.spec.ts",
      use: {
        storageState: authFile,
      },
    },
    {
      name: "update-tester-config",
      testMatch: "update-tester-config.spec.ts",
      use: {
        storageState: authFile,
      },
    },
    {
      name: "e2e-tester",
      testMatch: "e2e-tester.spec.ts",
      timeout: buildWaitMs * 2 + 10 * 60 * 1000, // 2 wait periods + 10 min buffer
      use: {
        storageState: authFile,
      },
    },
    {
      name: "e2e-s2s",
      testMatch: "e2e-s2s.spec.ts",
      timeout: buildWaitMs + 10 * 60 * 1000, // 1 wait period + 10 min buffer
      use: {
        storageState: authFile,
      },
    },
    {
      name: "full-test",
      testMatch: "full-test.spec.ts",
      use: {
        storageState: authFile,
      },
    },
  ],
});
