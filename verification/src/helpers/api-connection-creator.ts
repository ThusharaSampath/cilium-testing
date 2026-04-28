/**
 * Creates Choreo service connections via REST + GraphQL APIs.
 *
 * Usage:
 *   npx tsx src/helpers/api-connection-creator.ts [tester|s2s|all]
 *
 * For each source component with declared connections in `components.ts`:
 *   1. GET existing connections — skip any whose name already exists.
 *   2. For each missing connection, look up the target service via the
 *      marketplace API (gives serviceId, schemaReference, target visibility).
 *   3. Resolve source component metadata + project environments via GraphQL.
 *   4. POST to the choreo-connections endpoint.
 */

import { config } from "../config/env.js";
import { components, type ConnectionDefinition } from "../config/components.js";
import { loadToken } from "./token-loader.js";

const CONNECTIONS_BASE =
  "https://apis.choreo.dev/connections/v1.0/configurations/service-configs";
const MARKETPLACE_URL =
  "https://apis.choreo.dev/marketplace/0.1.0/resources";
const DELAY_BETWEEN_CONNECTIONS_MS = 2_000;

function authHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    Origin: "https://console.choreo.dev",
    Referer: "https://console.choreo.dev/",
  };
}

interface SourceComponent {
  id: string;
  handler: string;
  displayType: string;
}

async function graphql(token: string, query: string): Promise<any> {
  const response = await fetch(config.graphqlUrl, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    throw new Error(`GraphQL HTTP ${response.status}: ${await response.text()}`);
  }
  const json = await response.json();
  if (json.errors) {
    throw new Error(
      `GraphQL errors: ${json.errors.map((e: any) => e.message).join("; ")}`
    );
  }
  return json.data;
}

async function getSourceComponent(
  token: string,
  handler: string
): Promise<SourceComponent> {
  const data = await graphql(
    token,
    `query {
      components(orgHandler: "${config.orgHandle}", projectId: "${config.projectId}") {
        id
        handler
        displayType
      }
    }`
  );
  const comp = (data.components ?? []).find(
    (c: any) => c.handler === handler
  );
  if (!comp) {
    throw new Error(`Source component "${handler}" not found in project`);
  }
  if (!comp.displayType) {
    throw new Error(`Source component "${handler}" has no displayType`);
  }
  return { id: comp.id, handler: comp.handler, displayType: comp.displayType };
}

async function getEnvironments(
  token: string
): Promise<{ id: string; name: string; isCritical: boolean }[]> {
  const data = await graphql(
    token,
    `query {
      environments(orgUuid: "${config.orgUuid}", type: "external", projectId: "${config.projectId}") {
        id
        name
        critical
      }
    }`
  );
  const envs = data.environments ?? [];
  if (envs.length === 0) {
    throw new Error("No environments returned for project");
  }
  return envs.map((e: any) => ({
    id: e.id,
    name: e.name,
    isCritical: !!e.critical,
  }));
}

async function fetchExistingConnectionNames(
  token: string,
  componentId: string
): Promise<Set<string>> {
  const url = `${CONNECTIONS_BASE}/connections?projectId=${config.projectId}&componentId=${componentId}`;
  const response = await fetch(url, { headers: authHeaders(token) });
  if (!response.ok) {
    throw new Error(
      `Existing connections HTTP ${response.status}: ${await response.text()}`
    );
  }
  const list: { name: string }[] = await response.json();
  return new Set(list.map((c) => c.name));
}

interface MarketplaceMatch {
  serviceId: string;
  schemaReference: string;
  visibility: string;
  serviceName: string;
}

async function lookupTargetService(
  token: string,
  targetServiceName: string
): Promise<MarketplaceMatch> {
  const params = new URLSearchParams({
    networkVisibilityFilter: "public,org,project",
    resourceTypes: "SERVICE",
    offset: "0",
    limit: "20",
    query: targetServiceName,
    sortBy: "createdTime",
    sortAscending: "false",
    searchContent: "false",
    networkVisibilityprojectId: config.projectId,
    aggregateByMajorVersion: "true",
  });
  const url = `${MARKETPLACE_URL}?${params.toString()}`;
  const response = await fetch(url, { headers: authHeaders(token) });
  if (!response.ok) {
    throw new Error(
      `Marketplace HTTP ${response.status}: ${await response.text()}`
    );
  }
  const body = await response.json();
  const matches = (body.data ?? []) as any[];

  const exact = matches.find((m) => m.name === targetServiceName);
  if (!exact) {
    const names = matches.map((m) => m.name).join(", ") || "(none)";
    throw new Error(
      `Marketplace did not return a service named "${targetServiceName}". Got: ${names}`
    );
  }

  const schemas = (exact.connectionSchemas ?? []) as any[];
  const defaultSchema = schemas.find((s) => s.isDefault) ?? schemas[0];
  if (!defaultSchema) {
    throw new Error(
      `Service "${targetServiceName}" has no connection schemas`
    );
  }
  const visibility = (exact.visibility ?? [])[0];
  if (!visibility) {
    throw new Error(
      `Service "${targetServiceName}" has no visibility entry`
    );
  }
  return {
    serviceId: exact.serviceId,
    schemaReference: defaultSchema.id,
    visibility,
    serviceName: exact.name,
  };
}

interface CreateConnectionInput {
  name: string;
  source: SourceComponent;
  target: MarketplaceMatch;
  environments: { id: string; isCritical: boolean }[];
}

async function postConnection(
  token: string,
  input: CreateConnectionInput
): Promise<void> {
  const body = {
    name: input.name,
    description: "",
    serviceId: input.target.serviceId,
    schemaReference: input.target.schemaReference,
    environments: input.environments.map((e) => ({
      id: e.id,
      isCritical: e.isCritical,
    })),
    visibilities: [
      {
        componentUuid: input.source.id,
        organizationUuid: config.orgUuid,
        projectUuid: config.projectId,
        componentType: input.source.displayType,
      },
    ],
    requestingServiceVisibility: input.target.visibility,
    orgIdInteger: config.orgId,
    componentType: "service",
  };

  const url = `${CONNECTIONS_BASE}/choreo-connections?generateCreds=true`;
  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });

  if (response.status !== 201 && response.status !== 200) {
    const text = await response.text();
    throw new Error(`Create connection HTTP ${response.status}: ${text}`);
  }

  const json = await response.json();
  if (json.isPartiallyCreated) {
    console.log(
      `  ⚠ Partial creation — some envs failed (typical when a target env has no deployment). groupUuid=${json.groupUuid}`
    );
  } else {
    console.log(`  ✓ Created (groupUuid=${json.groupUuid})`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SourceSpec {
  name: string;
  connections: ConnectionDefinition[];
}

function selectSources(group: "tester" | "s2s" | "all"): SourceSpec[] {
  const filtered = components.filter((c) => {
    if (!c.connections?.length) return false;
    if (group === "tester") return c.name === "tester";
    if (group === "s2s") return c.name !== "tester";
    return true;
  });
  return filtered.map((c) => ({ name: c.name, connections: c.connections! }));
}

async function processSource(
  token: string,
  source: SourceSpec,
  environments: { id: string; isCritical: boolean }[]
): Promise<{ created: number; skipped: number; failed: number }> {
  console.log(`\n=== ${source.name} ===`);

  const sourceComponent = await getSourceComponent(token, source.name);
  console.log(
    `  componentId=${sourceComponent.id}, type=${sourceComponent.displayType}`
  );

  const existing = await fetchExistingConnectionNames(token, sourceComponent.id);
  console.log(
    `  Existing: ${existing.size > 0 ? [...existing].join(", ") : "(none)"}`
  );

  const todo = source.connections.filter((c) => !existing.has(c.name));
  if (todo.length === 0) {
    console.log("  Nothing to create.");
    return { created: 0, skipped: source.connections.length, failed: 0 };
  }

  let created = 0;
  let failed = 0;
  for (let i = 0; i < todo.length; i++) {
    const conn = todo[i];
    console.log(
      `\n  [${i + 1}/${todo.length}] "${conn.name}" -> "${conn.targetServiceName}"`
    );

    try {
      const target = await lookupTargetService(token, conn.targetServiceName);
      console.log(
        `    serviceId=${target.serviceId}, visibility=${target.visibility}, schema=${target.schemaReference}`
      );
      await postConnection(token, {
        name: conn.name,
        source: sourceComponent,
        target,
        environments,
      });
      created++;
    } catch (err: any) {
      console.log(`    ✗ Failed: ${err.message}`);
      failed++;
    }

    if (i < todo.length - 1) {
      await sleep(DELAY_BETWEEN_CONNECTIONS_MS);
    }
  }

  return {
    created,
    skipped: source.connections.length - todo.length,
    failed,
  };
}

async function main(): Promise<void> {
  const arg = (process.argv[2] as "tester" | "s2s" | "all" | undefined) ?? "all";
  if (arg !== "tester" && arg !== "s2s" && arg !== "all") {
    console.error(`Unknown group "${arg}". Use tester|s2s|all.`);
    process.exit(1);
  }

  const sources = selectSources(arg);
  if (sources.length === 0) {
    console.log("No source components with connections — nothing to do.");
    return;
  }

  const token = loadToken();

  console.log(
    `Connection creation: group=${arg}, sources=[${sources.map((s) => s.name).join(", ")}]`
  );

  console.log("\nFetching project environments...");
  const envs = await getEnvironments(token);
  console.log(
    `  Found ${envs.length}: ${envs.map((e) => `${e.name}(${e.id.slice(0, 8)})`).join(", ")}`
  );

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  for (const source of sources) {
    const r = await processSource(
      token,
      source,
      envs.map((e) => ({ id: e.id, isCritical: e.isCritical }))
    );
    totalCreated += r.created;
    totalSkipped += r.skipped;
    totalFailed += r.failed;
  }

  console.log(
    `\n=== Summary === created=${totalCreated}, skipped=${totalSkipped}, failed=${totalFailed}`
  );
  if (totalFailed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`\n✗ Fatal: ${err.message}`);
  process.exit(1);
});
