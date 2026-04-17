import { test } from "@playwright/test";
import { components } from "../config/components.js";
import { createConnection } from "../helpers/connection-creator.js";
import { config } from "../config/env.js";

// S2S track only — find components with connections that are NOT the tester.
// Tester connections are handled by create-tester-connections.spec.ts
const s2sComponentsWithConnections = components.filter(
  (c) => c.name !== "tester" && c.connections && c.connections.length > 0
);

for (const component of s2sComponentsWithConnections) {
  const componentUrl = `${config.projectUrl}/components/${component.name}`;

  for (const connection of component.connections!) {
    test(`Create connection: ${connection.name} for ${component.name}`, async ({
      page,
    }) => {
      await createConnection(page, componentUrl, connection);
    });
  }
}
