import { test } from "@playwright/test";
import { components } from "../config/components.js";
import { createConnection, fetchExistingConnections, getComponentId } from "../helpers/connection-creator.js";
import { config } from "../config/env.js";

// S2S track only — find components with connections that are NOT the tester.
// Tester connections are handled by create-tester-connections.spec.ts
const s2sComponentsWithConnections = components.filter(
  (c) => c.name !== "tester" && c.connections && c.connections.length > 0
);

for (const component of s2sComponentsWithConnections) {
  const componentUrl = `${config.projectUrl}/components/${component.name}`;

  test(`Create connections for ${component.name}`, async ({ page }) => {
    // Fetch existing connections via API to determine what needs creating
    console.log(`\nChecking existing connections for "${component.name}"...`);
    const componentId = await getComponentId(component.name);
    const existing = await fetchExistingConnections(componentId);

    const toCreate = component.connections!.filter((c) => {
      if (existing.has(c.name)) {
        console.log(`  Connection "${c.name}" already exists — skipping.`);
        return false;
      }
      return true;
    });

    if (toCreate.length === 0) {
      console.log("\nAll connections already exist. Nothing to create.");
      return;
    }

    for (const connection of toCreate) {
      await createConnection(page, componentUrl, connection);
    }
  });
}
