import { test } from "@playwright/test";
import { components } from "../config/components.js";
import { createComponent } from "../helpers/component-creator.js";
import { createConnection } from "../helpers/connection-creator.js";
import { fetchExistingComponents } from "../helpers/component-fetcher.js";

const s2sComponents = ["server", "client"];

const targetComponents = components.filter((c) =>
  s2sComponents.includes(c.name)
);

test.describe.serial("E2E Service-to-Service Flow", () => {
  test("Step 1: Create server and client components (skips existing)", async ({ page }) => {
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

  test("Step 2: Manual steps required", async () => {
    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║       S2S SETUP COMPLETE - MANUAL STEPS REQUIRED        ║");
    console.log("╠══════════════════════════════════════════════════════════╣");
    console.log("║                                                          ║");
    console.log("║  1. Wait for all component builds to succeed in Choreo   ║");
    console.log("║                                                          ║");
    console.log("║  2. Go to Choreo console → project-level-client          ║");
    console.log("║     → Connections → copy the connection resourceRef      ║");
    console.log("║                                                          ║");
    console.log("║  3. Update the client's component.yaml:                  ║");
    console.log("║     service-to-service/project-level/client/             ║");
    console.log("║       .choreo/component.yaml                             ║");
    console.log("║     Update the resourceRef under connectionReferences    ║");
    console.log("║                                                          ║");
    console.log("║  4. Commit and push:                                     ║");
    console.log("║     git add . && git commit -m 'update s2s ref' && push  ║");
    console.log("║                                                          ║");
    console.log("║  5. Rebuild the client component in Choreo               ║");
    console.log("║                                                          ║");
    console.log("║  6. Once deployed, run the full test:                    ║");
    console.log("║     npm run full-test                                    ║");
    console.log("║                                                          ║");
    console.log("╚══════════════════════════════════════════════════════════╝\n");
  });
});
