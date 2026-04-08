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

const s2sComponents = ["project-level-server", "project-level-client"];

const targetComponents = components.filter((c) =>
  s2sComponents.includes(c.name)
);

let buildDetails: CapturedBuildDetails;

test.describe.serial("E2E Service-to-Service Flow", () => {
  test("Step 1: Create server and client components", async ({ page }) => {
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

  test("Step 3: Manual steps required", async () => {
    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║       S2S SETUP COMPLETE - MANUAL STEPS REQUIRED        ║");
    console.log("╠══════════════════════════════════════════════════════════╣");
    console.log("║                                                          ║");
    console.log("║  1. Go to Choreo console → project-level-client          ║");
    console.log("║     → Connections → copy the connection resourceRef      ║");
    console.log("║                                                          ║");
    console.log("║  2. Update the client's component.yaml:                  ║");
    console.log("║     service-to-service/project-level/client/             ║");
    console.log("║       .choreo/component.yaml                             ║");
    console.log("║     Update the resourceRef under connectionReferences    ║");
    console.log("║                                                          ║");
    console.log("║  3. Commit and push:                                     ║");
    console.log("║     git add . && git commit -m 'update s2s ref' && push  ║");
    console.log("║                                                          ║");
    console.log("║  4. Rebuild the client component in Choreo               ║");
    console.log("║                                                          ║");
    console.log("║  5. Once deployed, run the full test:                    ║");
    console.log("║     npm run full-test                                    ║");
    console.log("║                                                          ║");
    console.log("╚══════════════════════════════════════════════════════════╝\n");
  });
});
