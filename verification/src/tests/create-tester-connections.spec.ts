import { test } from "@playwright/test";
import { components } from "../config/components.js";
import { createConnections, fetchExistingConnections, getComponentId } from "../helpers/connection-creator.js";
import { config } from "../config/env.js";

const tester = components.find((c) => c.name === "tester");

test("Create all tester connections", async ({ page }) => {
  if (!tester?.connections?.length) {
    console.log("No connections defined for tester — skipping.");
    return;
  }

  // Fetch existing connections via API to determine what needs creating
  console.log(`\nChecking existing connections for "tester"...`);
  const componentId = await getComponentId("tester");
  const existing = await fetchExistingConnections(componentId);

  const toCreate = tester.connections.filter((c) => {
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

  const componentUrl = `${config.projectUrl}/components/${tester.name}`;
  await createConnections(page, componentUrl, toCreate);
});
