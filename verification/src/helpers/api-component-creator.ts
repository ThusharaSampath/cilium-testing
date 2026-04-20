/**
 * Creates Choreo components via the GraphQL API instead of browser UI.
 *
 * Usage:
 *   npx tsx src/helpers/api-component-creator.ts [tester|s2s|all]
 *
 * Uses the STS token from .choreo-token.json (captured via Playwright).
 * Idempotent — fetches existing components first and skips them.
 */

import { config } from "../config/env.js";
import {
  type ApiComponentDefinition,
  apiComponents,
  getComponentsByGroup,
} from "../config/api-components.js";
import { loadToken } from "./token-loader.js";

const GRAPHQL_URL = "https://apis.choreo.dev/projects/1.0.0/graphql";
const DELAY_BETWEEN_COMPONENTS_MS = 5_000;

async function fetchExistingComponents(token: string): Promise<Set<string>> {
  const query = `query {
    components(orgHandler: "${config.orgHandle}", projectId: "${config.projectId}") {
      handler
    }
  }`;

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

  const json = await response.json();
  const components: { handler: string }[] = json?.data?.components ?? [];
  return new Set(components.map((c) => c.handler));
}

function buildServiceMutation(
  comp: ApiComponentDefinition,
  repoUrl: string,
  branch: string
): string {
  return `mutation {
      createBuildpackComponent(
        component: {
          name: "${comp.name}",
          displayName: "${comp.displayName}",
          description: "",
          orgId: ${config.orgId},
          orgHandler: "${config.orgHandle}",
          projectId: "${config.projectId}",
          labels: "",
          componentType: "buildpackService",
          port: null,
          oasFilePath: "",
          accessibility: "${comp.accessibility}",
          isAsyncCreationEnabled: true,
          buildpackConfig: {
            buildContext: "${comp.buildContext}",
            srcGitRepoUrl: "${repoUrl}",
            srcGitRepoBranch: "${branch}",
            languageVersion: "${comp.buildpack!.languageVersion}",
            buildpackId: "${comp.buildpack!.buildpackId}"
          }
          secretRef: "",
          originCloud: "choreo",
          isPublicRepo: true
        }
      )
      {
        id, createdAt, updatedAt, name, handle,
        organizationId, projectId, orgHandle, type,
        description, componentType, httpBased
      }
    }`;
}

function buildWebAppMutation(
  comp: ApiComponentDefinition,
  repoUrl: string,
  branch: string
): string {
  return `mutation {
      createByocComponent(
        component: {
          name: "${comp.name}",
          displayName: "${comp.displayName}",
          description: "",
          orgId: ${config.orgId},
          orgHandler: "${config.orgHandle}",
          projectId: "${config.projectId}",
          labels: "",
          componentType: "byocWebAppsDockerfileLess",
          accessibility: "${comp.accessibility}",
          byocWebAppsConfig: {
            dockerContext: "${comp.buildContext}",
            srcGitRepoUrl: "${repoUrl}",
            srcGitRepoBranch: "${branch}",
            webAppType: "${comp.webApp!.webAppType}"
            webAppBuildCommand: "${comp.webApp!.buildCommand}"
            webAppPackageManagerVersion: "${comp.webApp!.packageManagerVersion}"
            webAppOutputDirectory: "${comp.webApp!.outputDirectory}"
            isAppGatewayEnabled: true
          }
          secretRef: "",
          originCloud: "choreo",
          isPublicRepo: true
        }
      )
      {
        id, createdAt, updatedAt, name, handle,
        organizationId, projectId, orgHandle, type,
        description, componentType, httpBased
      }
    }`;
}

async function createComponent(
  comp: ApiComponentDefinition,
  token: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const repoUrl = `https://github.com/${config.githubRepo}`;
  const branch = config.githubBranch;

  const query =
    comp.componentType === "buildpackService"
      ? buildServiceMutation(comp, repoUrl, branch)
      : buildWebAppMutation(comp, repoUrl, branch);

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
    return { success: false, error: `HTTP ${response.status}: ${text}` };
  }

  const json = await response.json();

  if (json.errors) {
    return {
      success: false,
      error: json.errors.map((e: any) => e.message).join("; "),
    };
  }

  const data =
    json.data?.createBuildpackComponent ?? json.data?.createByocComponent;
  return { success: true, data };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const group = process.argv[2] as "tester" | "s2s" | "all" | undefined;

  let targets: ApiComponentDefinition[];
  if (group === "tester") {
    targets = getComponentsByGroup("tester");
  } else if (group === "s2s") {
    targets = getComponentsByGroup("s2s");
  } else {
    targets = apiComponents;
  }

  const token = loadToken();

  // Fetch existing components for idempotency
  console.log("Checking existing components...");
  const existing = await fetchExistingComponents(token);
  console.log(`Found ${existing.size} existing component(s): ${[...existing].join(", ") || "(none)"}\n`);

  // Filter out already existing
  const toCreate = targets.filter((c) => {
    if (existing.has(c.name)) {
      console.log(`Skipping "${c.name}" — already exists`);
      return false;
    }
    return true;
  });

  if (toCreate.length === 0) {
    console.log("\nAll components already exist. Nothing to create.");
    return;
  }

  console.log(`\nCreating ${toCreate.length} component(s) via API...`);
  console.log(`Org: ${config.orgHandle} | Project: ${config.projectId}`);
  console.log(`Repo: ${config.githubRepo} | Branch: ${config.githubBranch}\n`);

  const results: { name: string; success: boolean; id?: string; error?: string }[] = [];

  for (let i = 0; i < toCreate.length; i++) {
    const comp = toCreate[i];
    console.log(`[${i + 1}/${toCreate.length}] Creating "${comp.name}" (${comp.componentType})...`);

    const result = await createComponent(comp, token);

    if (result.success) {
      console.log(`  ✓ Created: id=${result.data.id}, handle=${result.data.handle}`);
      results.push({ name: comp.name, success: true, id: result.data.id });
    } else {
      console.log(`  ✗ Failed: ${result.error}`);
      results.push({ name: comp.name, success: false, error: result.error });
    }

    if (i < toCreate.length - 1) {
      console.log(`  Waiting ${DELAY_BETWEEN_COMPONENTS_MS / 1000}s before next...\n`);
      await sleep(DELAY_BETWEEN_COMPONENTS_MS);
    }
  }

  // Summary
  console.log("\n=== Summary ===");
  for (const r of results) {
    const status = r.success ? "✓" : "✗";
    const detail = r.success ? `id=${r.id}` : r.error;
    console.log(`  ${status} ${r.name}: ${detail}`);
  }

  const failed = results.filter((r) => !r.success).length;
  if (failed > 0) {
    console.log(`\n${failed} component(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll components created successfully.");
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
