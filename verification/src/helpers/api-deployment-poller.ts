/**
 * Polls Choreo component deployment status until ACTIVE.
 *
 * Usage:
 *   npx tsx src/helpers/api-deployment-poller.ts <component-name>
 *
 * Steps:
 *   1. Load STS token
 *   2. Fetch componentId + versionId for the target component
 *   3. Fetch the first environment via environments query
 *   4. Poll componentDeployment until deploymentStatus === "ACTIVE"
 */

import { config } from "../config/env.js";
import { loadToken } from "./token-loader.js";

const GRAPHQL_URL = "https://apis.choreo.dev/projects/1.0.0/graphql";
const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS =
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
  handler: string;
  versionId: string;
}

async function getComponentInfo(
  token: string,
  componentName: string
): Promise<ComponentInfo> {
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
    (c: any) => c.handler === componentName
  );
  if (!comp) {
    throw new Error(`Component "${componentName}" not found in project`);
  }
  if (!comp.deploymentTracks?.length) {
    throw new Error(`Component "${componentName}" has no deployment tracks`);
  }

  return {
    id: comp.id,
    handler: comp.handler,
    versionId: comp.deploymentTracks[0].id,
  };
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

async function pollDeployment(
  token: string,
  comp: ComponentInfo,
  environmentId: string
): Promise<void> {
  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > POLL_TIMEOUT_MS) {
      throw new Error(
        `Deployment timed out after ${POLL_TIMEOUT_MS / 60000} minutes`
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
          deploymentStatus
          deploymentStatusV2
        }
      }`
    );

    const deployment = data.componentDeployment;
    if (!deployment) {
      console.log(`  ${comp.handler}: no deployment found yet`);
    } else {
      const status = deployment.deploymentStatus;
      const statusV2 = deployment.deploymentStatusV2;
      console.log(
        `  ${comp.handler}: deploymentStatus=${status}, deploymentStatusV2=${statusV2}`
      );

      if (status === "ACTIVE" && statusV2 === "ACTIVE") {
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

async function main() {
  const componentName = process.argv[2];

  if (!componentName) {
    console.error(
      "Usage: npx tsx src/helpers/api-deployment-poller.ts <component-name>"
    );
    process.exit(1);
  }

  const token = loadToken();

  console.log(`Getting component info for "${componentName}"...`);
  const comp = await getComponentInfo(token, componentName);
  console.log(
    `  componentId=${comp.id}, versionId=${comp.versionId}`
  );

  console.log("Fetching environment...");
  const environmentId = await getEnvironmentId(token);

  console.log(
    `\nPolling deployment status (interval=${POLL_INTERVAL_MS / 1000}s, timeout=${POLL_TIMEOUT_MS / 60000}min)...\n`
  );

  await pollDeployment(token, comp, environmentId);

  console.log(`\n✓ ${componentName} deployment is ACTIVE.`);
}

main().catch((err) => {
  console.error(`✗ Fatal error: ${err.message}`);
  process.exit(1);
});
