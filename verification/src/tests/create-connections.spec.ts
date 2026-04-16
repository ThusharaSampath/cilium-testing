import { test } from "@playwright/test";
import { components } from "../config/components.js";
import { createConnection } from "../helpers/connection-creator.js";
import { config } from "../config/env.js";

// Find all components that have connections defined
const componentsWithConnections = components.filter(
  (c) => c.connections && c.connections.length > 0
);

for (const component of componentsWithConnections) {
  const componentUrl = `${config.projectUrl}/components/${component.name}`;

  for (const connection of component.connections!) {
    test(`Create connection: ${connection.name} for ${component.name}`, async ({
      page,
    }) => {
      await createConnection(page, componentUrl, connection);
    });
  }
}
