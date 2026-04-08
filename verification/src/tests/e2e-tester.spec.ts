import { test } from "@playwright/test";
import { components } from "../config/components.js";
import { config } from "../config/env.js";
import { createComponent } from "../helpers/component-creator.js";
import { createConnection } from "../helpers/connection-creator.js";
import {
  CapturedBuildDetails,
  ComponentBuildInfo,
  pollBuildStatus,
} from "../helpers/build-poller.js";

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

let buildDetails: CapturedBuildDetails;

test.describe.serial("E2E Tester Flow", () => {
  test("Step 1: Create components", async ({ page }) => {
    const componentInfos: ComponentBuildInfo[] = [];
    let token = "";
    let apiUrl = "";

    for (const component of targetComponents) {
      console.log(`Creating component: ${component.name}`);
      const result = await createComponent(page, component);

      token = result.token;
      apiUrl = result.apiUrl;
      componentInfos.push({
        name: component.name,
        componentId: result.componentId,
        versionId: result.versionId,
        componentUrl: result.componentUrl,
      });

      if (component.connections) {
        for (const connection of component.connections) {
          await createConnection(page, result.componentUrl, connection);
        }
      }
    }

    buildDetails = { token, apiUrl, components: componentInfos };
  });

  test("Step 2: Wait for builds", async () => {
    console.log("Polling build status for all components...");
    await pollBuildStatus(buildDetails, 30_000, config.buildWaitMs);
  });

  test("Step 3: Next steps", async () => {
    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║     TESTER SETUP COMPLETE - RUN THESE NEXT              ║");
    console.log("╠══════════════════════════════════════════════════════════╣");
    console.log("║                                                          ║");
    console.log("║  1. Collect endpoint URLs:                               ║");
    console.log("║     npm run collect:urls                                 ║");
    console.log("║                                                          ║");
    console.log("║  2. Update tester env config and redeploy:               ║");
    console.log("║     npm run update:config                                ║");
    console.log("║                                                          ║");
    console.log("║  3. Wait for tester to redeploy, then run full test:     ║");
    console.log("║     npm run full-test                                    ║");
    console.log("║                                                          ║");
    console.log("╚══════════════════════════════════════════════════════════╝\n");
  });
});
