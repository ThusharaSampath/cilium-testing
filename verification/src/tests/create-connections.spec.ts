import { test } from "@playwright/test";
import { components } from "../config/components.js";
import { createConnection } from "../helpers/connection-creator.js";
import { config } from "../config/env.js";

// COMPONENT_URL must be set (the auto-generated component URL from Choreo)
const componentUrl = process.env.COMPONENT_URL;
// COMPONENT_NAME selects which component's connections to create
const componentName = process.env.COMPONENT_NAME;

if (!componentUrl || !componentName) {
  throw new Error(
    "Both COMPONENT_URL and COMPONENT_NAME are required.\n" +
      "  COMPONENT_URL: the full Choreo component URL (e.g., https://.../{project}/components/{slug})\n" +
      "  COMPONENT_NAME: the component name from config (e.g., project-level-client)"
  );
}

const component = components.find((c) => c.name === componentName);
if (!component) {
  throw new Error(
    `Component "${componentName}" not found. Available: ${components.map((c) => c.name).join(", ")}`
  );
}

if (!component.connections || component.connections.length === 0) {
  throw new Error(`Component "${componentName}" has no connections defined.`);
}

for (const connection of component.connections) {
  test(`Create connection: ${connection.name} for ${componentName}`, async ({
    page,
  }) => {
    await createConnection(page, componentUrl, connection);
  });
}
