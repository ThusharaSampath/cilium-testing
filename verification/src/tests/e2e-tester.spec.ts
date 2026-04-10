import { test } from "@playwright/test";
import { components } from "../config/components.js";
import { createComponent } from "../helpers/component-creator.js";
import { createConnection } from "../helpers/connection-creator.js";
import { fetchExistingComponents } from "../helpers/component-fetcher.js";

const testerComponents = [
  "org-service",
  "public-service",
  "project-service",
  "react-single-page-app",
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
      const result = await createComponent(page, component);

      if (component.connections) {
        for (const connection of component.connections) {
          await createConnection(page, result.componentUrl, connection);
        }
      }
    }
  });

  test("Step 2: Next steps", async () => {
    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║     TESTER SETUP COMPLETE - RUN THESE NEXT              ║");
    console.log("╠══════════════════════════════════════════════════════════╣");
    console.log("║                                                          ║");
    console.log("║  1. Wait for all component builds to succeed in Choreo   ║");
    console.log("║                                                          ║");
    console.log("║  2. Collect endpoint URLs:                               ║");
    console.log("║     npm run collect:urls                                 ║");
    console.log("║                                                          ║");
    console.log("║  3. Update tester env config and redeploy:               ║");
    console.log("║     npm run update:config                                ║");
    console.log("║                                                          ║");
    console.log("║  4. Wait for tester to redeploy, then run full test:     ║");
    console.log("║     npm run full-test                                    ║");
    console.log("║                                                          ║");
    console.log("╚══════════════════════════════════════════════════════════╝\n");
  });
});
