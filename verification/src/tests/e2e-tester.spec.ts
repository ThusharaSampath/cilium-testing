import { test } from "@playwright/test";
import { components } from "../config/components.js";
import { createComponent } from "../helpers/component-creator.js";
import { createConnections } from "../helpers/connection-creator.js";
import { fetchExistingComponents } from "../helpers/component-fetcher.js";
import { config } from "../config/env.js";

const testerComponents = [
  "org-service",
  "public-service",
  "project-service",
  "tester",
];

const targetComponents = components.filter((c) =>
  testerComponents.includes(c.name)
);

test.describe.serial("E2E Tester Flow", () => {
  test("Step 1: Create components (skips existing)", async ({ page }) => {
    // Fetch existing components to avoid re-creating them
    const existing = await fetchExistingComponents(page);
    const existingNames = new Set(existing.map((c) => c.handler));

    for (const component of targetComponents) {
      if (existingNames.has(component.name)) {
        console.log(`Skipping ${component.name} — already exists`);
        continue;
      }

      console.log(`Creating component: ${component.name}`);
      await createComponent(page, component);
    }
  });

  test("Step 2: Create tester connections", async ({ page }) => {
    const tester = targetComponents.find((c) => c.name === "tester");
    if (!tester?.connections?.length) {
      console.log("No connections defined for tester — skipping.");
      return;
    }

    const componentUrl = `${config.projectUrl}/components/${tester.name}`;
    await createConnections(page, componentUrl, tester.connections);
  });

  test("Step 3: Next steps", async () => {
    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║     TESTER SETUP COMPLETE - RUN THESE NEXT              ║");
    console.log("╠══════════════════════════════════════════════════════════╣");
    console.log("║                                                          ║");
    console.log("║  1. Wait for all component builds to succeed in Choreo   ║");
    console.log("║                                                          ║");
    console.log("║  2. Deploy the tester component in Choreo console        ║");
    console.log("║     (to pick up the new connections)                     ║");
    console.log("║                                                          ║");
    console.log("║  3. Run the tester test:                                 ║");
    console.log("║     npm run test:api -- tester /test                     ║");
    console.log("║                                                          ║");
    console.log("╚══════════════════════════════════════════════════════════╝\n");
  });
});
