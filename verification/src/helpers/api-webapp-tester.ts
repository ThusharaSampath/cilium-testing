/**
 * Tests the webapp component end-to-end:
 *   1. Poll build until success
 *   2. Poll deployment until ACTIVE
 *   3. Fetch invokeUrl and curl it
 *
 * Usage:
 *   npx tsx src/helpers/api-webapp-tester.ts
 */

import { config } from "../config/env.js";
import { loadToken } from "./token-loader.js";

const GRAPHQL_URL = "https://apis.choreo.dev/projects/1.0.0/graphql";
const WEBAPP_COMPONENT_NAME = "react-single-page-app";
const BUILD_POLL_INTERVAL_MS = 30_000;
const BUILD_POLL_TIMEOUT_MS =
  parseInt(process.env.BUILD_WAIT_MINUTES ?? "15") * 60 * 1000;
const DEPLOY_POLL_INTERVAL_MS = 15_000;
const DEPLOY_POLL_TIMEOUT_MS =
  parseInt(process.env.DEPLOY_WAIT_MINUTES ?? "10") * 60 * 1000;

async function graphql(token: string, query: string): Promise<any> {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      Origin: "https://console.choreo.dev",
      Referer: "https://console.choreo.dev/",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GraphQL HTTP ${response.status}: ${text}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(
      `GraphQL errors: ${json.errors.map((e: any) => e.message).join("; ")}`
    );
  }
  return json.data;
}

interface ComponentInfo {
  id: string;
  versionId: string;
}

async function getComponentInfo(token: string): Promise<ComponentInfo> {
  const data = await graphql(
    token,
    `query {
      components(orgHandler: "${config.orgHandle}", projectId: "${config.projectId}") {
        id
        handler
        deploymentTracks {
          id
        }
      }
    }`
  );

  const comp = (data.components ?? []).find(
    (c: any) => c.handler === WEBAPP_COMPONENT_NAME
  );
  if (!comp) {
    throw new Error(`Component "${WEBAPP_COMPONENT_NAME}" not found`);
  }
  if (!comp.deploymentTracks?.length) {
    throw new Error(
      `Component "${WEBAPP_COMPONENT_NAME}" has no deployment tracks`
    );
  }

  return { id: comp.id, versionId: comp.deploymentTracks[0].id };
}

async function getEnvironmentId(token: string): Promise<string> {
  const data = await graphql(
    token,
    `query {
      environments(
        orgUuid: "${config.orgUuid}"
        type: "external"
        projectId: "${config.projectId}"
      ) {
        name
        id
      }
    }`
  );

  const envs = data.environments ?? [];
  if (envs.length === 0) {
    throw new Error("No environments found");
  }

  console.log(`  Using environment: ${envs[0].name} (${envs[0].id})`);
  return envs[0].id;
}

// ── Step 1: Poll build ──────────────────────────────────

async function pollBuild(token: string, comp: ComponentInfo): Promise<void> {
  console.log(
    `\nPolling webapp build (interval=${BUILD_POLL_INTERVAL_MS / 1000}s, timeout=${BUILD_POLL_TIMEOUT_MS / 60000}min)...\n`
  );

  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > BUILD_POLL_TIMEOUT_MS) {
      throw new Error(
        `Build timed out after ${BUILD_POLL_TIMEOUT_MS / 60000} minutes`
      );
    }

    const data = await graphql(
      token,
      `query {
        deploymentStatusByVersion(
          versionId: "${comp.versionId}",
          componentId: "${comp.id}"
        ) {
          status
          conclusion
          conclusionV2
        }
      }`
    );

    const builds = data.deploymentStatusByVersion ?? [];
    if (builds.length > 0) {
      const latest = builds[0];
      const conclusion = latest.conclusionV2 || latest.conclusion;
      console.log(
        `  build: status=${latest.status}, conclusion=${conclusion || "(pending)"}`
      );

      if (latest.status === "completed") {
        if (conclusion === "success") {
          console.log("  ✓ Build succeeded.");
          return;
        } else {
          throw new Error(`Build failed: conclusion=${conclusion}`);
        }
      }
    } else {
      console.log("  build: no builds yet");
    }

    await new Promise((resolve) => setTimeout(resolve, BUILD_POLL_INTERVAL_MS));
  }
}

// ── Step 2: Poll deployment ─────────────────────────────

async function pollDeployment(
  token: string,
  comp: ComponentInfo,
  environmentId: string
): Promise<string> {
  console.log(
    `\nPolling webapp deployment (interval=${DEPLOY_POLL_INTERVAL_MS / 1000}s, timeout=${DEPLOY_POLL_TIMEOUT_MS / 60000}min)...\n`
  );

  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > DEPLOY_POLL_TIMEOUT_MS) {
      throw new Error(
        `Deployment timed out after ${DEPLOY_POLL_TIMEOUT_MS / 60000} minutes`
      );
    }

    const data = await graphql(
      token,
      `query {
        componentDeployment(
          orgHandler: "${config.orgHandle}"
          orgUuid: "${config.orgUuid}"
          componentId: "${comp.id}"
          versionId: "${comp.versionId}"
          environmentId: "${environmentId}"
        ) {
          invokeUrl
          deploymentStatus
          deploymentStatusV2
        }
      }`
    );

    const deployment = data.componentDeployment;
    if (!deployment) {
      console.log("  deployment: not found yet");
    } else {
      console.log(
        `  deployment: status=${deployment.deploymentStatus}, statusV2=${deployment.deploymentStatusV2}`
      );

      if (
        deployment.deploymentStatus === "ACTIVE" &&
        deployment.deploymentStatusV2 === "ACTIVE"
      ) {
        if (!deployment.invokeUrl) {
          throw new Error("Deployment is ACTIVE but no invokeUrl found");
        }
        console.log("  ✓ Deployment is ACTIVE.");
        return deployment.invokeUrl;
      }
    }

    await new Promise((resolve) =>
      setTimeout(resolve, DEPLOY_POLL_INTERVAL_MS)
    );
  }
}

// ── Step 3: Test ────────────────────────────────────────

async function testWebapp(invokeUrl: string): Promise<void> {
  console.log(`\nCalling: GET ${invokeUrl}`);
  const response = await fetch(invokeUrl);
  const body = await response.text();

  console.log(`\n=== Response (HTTP ${response.status}) ===`);
  console.log(`  Content-Type: ${response.headers.get("content-type")}`);
  console.log(`  Body length: ${body.length} chars`);
  console.log(`=== End Response ===`);

  if (response.status >= 200 && response.status < 300) {
    console.log(`\n✓ Webapp test passed: HTTP ${response.status}`);
  } else {
    console.log(`\n✗ Webapp test failed: HTTP ${response.status}`);
    process.exit(1);
  }
}

// ── Main ────────────────────────────────────────────────

async function main() {
  const token = loadToken();

  console.log(`Getting component info for "${WEBAPP_COMPONENT_NAME}"...`);
  const comp = await getComponentInfo(token);
  console.log(`  componentId=${comp.id}, versionId=${comp.versionId}`);

  console.log("Fetching environment...");
  const environmentId = await getEnvironmentId(token);

  // Step 1: Wait for build
  await pollBuild(token, comp);

  // Step 2: Wait for deployment ACTIVE + get invokeUrl
  const invokeUrl = await pollDeployment(token, comp, environmentId);

  // Step 3: Test
  await testWebapp(invokeUrl);
}

main().catch((err) => {
  console.error(`✗ Fatal error: ${err.message}`);
  process.exit(1);
});
