/**
 * Tests a Choreo component endpoint via API (no browser needed).
 *
 * Usage:
 *   npx tsx src/helpers/api-test-runner.ts <component-name> <endpoint-path>
 *
 * Steps:
 *   1. Load STS token + fetch componentId/versionId
 *   2. Query componentEndpoints to get publicUrl + apimId
 *   3. Generate a test API key via sts.choreo.dev
 *   4. Call the endpoint with Test-Key header
 *   5. Print response and exit 0 on success, 1 on failure
 */

import { config } from "../config/env.js";
import { loadToken } from "./token-loader.js";

const GRAPHQL_URL = "https://apis.choreo.dev/projects/1.0.0/graphql";

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

interface EndpointInfo {
  apimId: string;
  publicUrl: string;
}

async function getEndpoint(
  token: string,
  componentId: string,
  versionId: string
): Promise<EndpointInfo> {
  const data = await graphql(
    token,
    `query {
      componentEndpoints(
        input: {
          componentId: "${componentId}"
          versionId: "${versionId}"
        }
      ) {
        apimId
        publicUrl
      }
    }`
  );

  const endpoints = data.componentEndpoints ?? [];
  if (endpoints.length === 0) {
    throw new Error("No endpoints found for this component");
  }

  return endpoints[0];
}

async function generateTestKey(
  token: string,
  apimId: string
): Promise<string> {
  const url = `https://sts.choreo.dev/api/am/publisher/v2/apis/${apimId}/generate-key?organizationId=${config.orgUuid}&keyType=Development`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Generate key failed HTTP ${response.status}: ${text}`);
  }

  const json = await response.json();
  if (!json.apikey) {
    throw new Error(`No apikey in response: ${JSON.stringify(json)}`);
  }

  return json.apikey;
}

async function callEndpoint(
  publicUrl: string,
  endpointPath: string,
  testKey: string
): Promise<{ status: number; body: string }> {
  // Ensure no double slashes
  const url = `${publicUrl.replace(/\/+$/, "")}${endpointPath}`;

  console.log(`Calling: GET ${url}`);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "*/*",
      "Test-Key": testKey,
    },
  });

  const body = await response.text();
  return { status: response.status, body };
}

async function main() {
  const componentName = process.argv[2];
  const endpointPath = process.argv[3] || "/";

  if (!componentName) {
    console.error(
      "Usage: npx tsx src/helpers/api-test-runner.ts <component-name> [endpoint-path]"
    );
    process.exit(1);
  }

  const token = loadToken();

  // Step 1: Get component info
  console.log(`Getting component info for "${componentName}"...`);
  const compInfo = await getComponentInfo(token, componentName);
  console.log(
    `  componentId=${compInfo.id}, versionId=${compInfo.versionId}`
  );

  // Step 2: Get endpoint
  console.log("Fetching endpoint...");
  const endpoint = await getEndpoint(token, compInfo.id, compInfo.versionId);
  console.log(`  publicUrl=${endpoint.publicUrl}`);
  console.log(`  apimId=${endpoint.apimId}`);

  // Step 3: Generate test key
  console.log("Generating test API key...");
  const testKey = await generateTestKey(token, endpoint.apimId);
  console.log(`  Test key generated (${testKey.length} chars)`);

  // Step 4: Call the endpoint
  console.log("");
  const result = await callEndpoint(endpoint.publicUrl, endpointPath, testKey);

  console.log(`\n=== Response (HTTP ${result.status}) ===`);
  // Try to pretty-print JSON
  try {
    const parsed = JSON.parse(result.body);
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log(result.body);
  }
  console.log("=== End Response ===");

  if (result.status >= 200 && result.status < 300) {
    console.log(`\n✓ Test passed: ${componentName}${endpointPath} → HTTP ${result.status}`);
  } else {
    console.log(`\n✗ Test failed: ${componentName}${endpointPath} → HTTP ${result.status}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
