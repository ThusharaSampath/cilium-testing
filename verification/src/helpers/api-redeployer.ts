/**
 * Redeploys a Choreo component via the GraphQL API (no browser needed).
 *
 * Usage:
 *   npx tsx src/helpers/api-redeployer.ts <component-name>
 *
 * Steps:
 *   1. Load STS token
 *   2. Fetch componentId + versionId (deployment track ID)
 *   3. Fetch environmentId
 *   4. Fetch latest buildId (imageId) from componentDeployment
 *   5. Fetch deploymentPipelineId from project
 *   6. Fetch componentEndpoints → build apiSettings (base64)
 *   7. Call deployDeploymentTrack mutation
 */

import { config } from "../config/env.js";
import { loadToken } from "./token-loader.js";

const GRAPHQL_URL = "https://apis.choreo.dev/projects/1.0.0/graphql";

async function graphql(
  token: string,
  query: string,
  variables?: Record<string, any>
): Promise<any> {
  const body: Record<string, any> = { query };
  if (variables) body.variables = variables;

  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      Origin: "https://console.choreo.dev",
      Referer: "https://console.choreo.dev/",
    },
    body: JSON.stringify(body),
  });

  console.log(response.headers)
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

  console.log(`  Environment: ${envs[0].name} (${envs[0].id})`);
  return envs[0].id;
}

async function getLatestBuildId(
  token: string,
  comp: ComponentInfo,
  environmentId: string
): Promise<{ buildId: string; releaseId: string }> {
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
        build {
          buildId
        }
        releaseId
      }
    }`
  );

  const deployment = data.componentDeployment;
  if (!deployment?.build?.buildId) {
    throw new Error(
      `No deployment/build found for "${comp.handler}". Has the component been deployed at least once?`
    );
  }

  console.log(`  Build ID (imageId): ${deployment.build.buildId}`);
  console.log(`  Release ID: ${deployment.releaseId}`);
  return {
    buildId: deployment.build.buildId,
    releaseId: deployment.releaseId,
  };
}

async function getDeploymentPipelineId(token: string): Promise<string> {
  const data = await graphql(
    token,
    `query {
      projects(orgId: ${config.orgId}) {
        id
        handler
        defaultDeploymentPipelineId
      }
    }`
  );

  const projects = data.projects ?? [];
  const project = projects.find(
    (p: any) => p.handler === config.projectHandler
  );
  if (!project) {
    throw new Error(
      `Project "${config.projectHandler}" not found. Available: ${projects.map((p: any) => p.handler).join(", ")}`
    );
  }

  console.log(
    `  Deployment pipeline: ${project.defaultDeploymentPipelineId}`
  );
  return project.defaultDeploymentPipelineId;
}

interface EndpointInfo {
  id: string;
  securityScheme: string[];
  operations: { verb: string; target: string; isSecured: boolean; scopes: string[] }[];
}

async function getApiSettings(
  token: string,
  comp: ComponentInfo,
  releaseId: string
): Promise<string> {
  const data = await graphql(
    token,
    `query {
      componentEndpoints(
        input: {
          componentId: "${comp.id}"
          versionId: "${comp.versionId}"
          options: {
            filter: {
              releaseIds: ["${releaseId}"]
            }
          }
        }
      ) {
        id
        type
        isScopeAdded
      }
    }`
  );

  const endpoints = data.componentEndpoints ?? [];

  if (endpoints.length === 0) {
    // No endpoints (e.g. a client component that only consumes) — return empty base64
    console.log("  No endpoints found — using empty apiSettings");
    return btoa("{}");
  }

  // Build apiSettings object: each endpoint ID maps to its security config
  const settings: Record<string, any> = {};
  for (const ep of endpoints) {
    if (ep.type === "REST") {
      settings[ep.id] = {
        securityScheme: ["oauth2", "oauth_basic_auth_api_key_mandatory"],
        scopes: [],
        operations: [], // empty = all operations use defaults
        authorizationHeader: "Authorization",
        apiKeyHeader: "api-key",
        enableBackendJWT: false,
        backendJWTAudienceClaim: [],
      };
    }
  }

  const encoded = btoa(JSON.stringify(settings));
  console.log(
    `  API settings: ${endpoints.length} endpoint(s) configured`
  );
  return encoded;
}

async function deploy(
  token: string,
  comp: ComponentInfo,
  imageId: string,
  environmentId: string,
  deploymentPipelineId: string,
  apiSettings: string
): Promise<void> {
  const mutation = `mutation deployDeploymentTrack($input: DeployDeploymentTrackInput!) {
    deployDeploymentTrack(input: $input)
  }`;

  const variables = {
    input: {
      componentId: comp.id,
      id: comp.versionId,
      imageId,
      environmentId,
      deploymentPipelineId,
      apiSettings,
    },
  };
  console.log({mutation, variables})

  const data = await graphql(token, mutation, variables);

  console.log(`  Response: ${data.deployDeploymentTrack}`);
}

async function main() {
  const componentName = process.argv[2];

  if (!componentName) {
    console.error(
      "Usage: npx tsx src/helpers/api-redeployer.ts <component-name>"
    );
    process.exit(1);
  }

  const token = loadToken();

  console.log(`\nRedeploying "${componentName}"...\n`);

  console.log("1. Fetching component info...");
  const comp = await getComponentInfo(token, componentName);
  console.log(`  componentId=${comp.id}, versionId=${comp.versionId}`);

  console.log("2. Fetching environment...");
  const environmentId = await getEnvironmentId(token);

  console.log("3. Fetching latest build...");
  const { buildId, releaseId } = await getLatestBuildId(
    token,
    comp,
    environmentId
  );

  console.log("4. Fetching deployment pipeline...");
  const deploymentPipelineId = await getDeploymentPipelineId(token);

  console.log("5. Fetching API settings...");
  const apiSettings = await getApiSettings(token, comp, releaseId);

  console.log("6. Deploying...");
  await deploy(
    token,
    comp,
    buildId,
    environmentId,
    deploymentPipelineId,
    apiSettings
  );

  console.log(`\n✓ Redeploy triggered for "${componentName}".`);
}

main().catch((err) => {
  console.error(`\n✗ Fatal error: ${err.message}`);
  process.exit(1);
});
