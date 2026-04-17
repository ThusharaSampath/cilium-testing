import { test } from "@playwright/test";
import { components } from "../config/components.js";
import { createConnections } from "../helpers/connection-creator.js";
import { config } from "../config/env.js";

const tester = components.find((c) => c.name === "tester");

test("Create all tester connections", async ({ page }) => {
  if (!tester?.connections?.length) {
    console.log("No connections defined for tester — skipping.");
    return;
  }

  const componentUrl = `${config.projectUrl}/components/${tester.name}`;
  await createConnections(page, componentUrl, tester.connections);
});
