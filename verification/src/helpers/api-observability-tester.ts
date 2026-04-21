/**
 * Tests Choreo observability APIs for a component (metrics + logs).
 *
 * Usage:
 *   npx tsx src/helpers/api-observability-tester.ts <component-name> [hours]
 *
 * Calls:
 *   - GET  choreoobsapi      /metrics/component/usage      (CPU/memory/network)
 *   - GET  choreoobsapi      /metrics/component/http       (request/latency)
 *   - POST choreologgingapi  /logs/component/application   (app logs)
 *
 * Success criteria: each endpoint returns HTTP 2xx with the expected shape.
 * Presence of non-empty data is logged but not required (a freshly-deployed
 * component may legitimately have zero rows within the window).
 */

import { config } from "../config/env.js";
import { loadToken } from "./token-loader.js";

const GRAPHQL_URL = "https://apis.choreo.dev/projects/1.0.0/graphql";
const OBS_HOST_ORG = "5659b6b7-1063-41ed-8e39-d91857699255";
const DEFAULT_WINDOW_HOURS = 24;
const BREAK_SIZE = "14m";

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

interface Target {
  componentId: string;
  versionId: string;
  environmentId: string;
  environmentName: string;
  releaseId: string;
  obsHost: string;
}

async function resolveTarget(
  token: string,
  componentName: string
): Promise<Target> {
  // 1. component + deployment track
  const compData = await graphql(
    token,
    `query {
      components(orgHandler: "${config.orgHandle}", projectId: "${config.projectId}") {
        id
        handler
        deploymentTracks { id }
      }
    }`
  );
  const comp = (compData.components ?? []).find(
    (c: any) => c.handler === componentName
  );
  if (!comp) throw new Error(`Component "${componentName}" not found`);
  if (!comp.deploymentTracks?.length)
    throw new Error(`Component "${componentName}" has no deployment tracks`);
  const componentId: string = comp.id;
  const versionId: string = comp.deploymentTracks[0].id;

  // 2. environment (first external env, matching redeployer behavior)
  const envData = await graphql(
    token,
    `query {
      environments(
        orgUuid: "${config.orgUuid}"
        type: "external"
        projectId: "${config.projectId}"
      ) { name id vhost }
    }`
  );
  const envs = envData.environments ?? [];
  if (!envs.length) throw new Error("No environments found");
  const env = envs[0];
  const environmentId: string = env.id;
  const environmentName: string = env.name;
  const vhost: string = env.vhost;

  // 3. release id from current deployment
  const depData = await graphql(
    token,
    `query {
      componentDeployment(
        orgHandler: "${config.orgHandle}"
        orgUuid: "${config.orgUuid}"
        componentId: "${componentId}"
        versionId: "${versionId}"
        environmentId: "${environmentId}"
      ) { releaseId }
    }`
  );
  const releaseId: string | undefined = depData.componentDeployment?.releaseId;
  if (!releaseId)
    throw new Error(
      `No release found for "${componentName}" in env "${environmentName}". Deploy it first.`
    );

  // 4. derive systemapis host from vhost
  //    vhost: <orgUuid>-<envName>.<suffix>   e.g. 24835e72-...-os-dev-2.prod.opc.choreoapis.dev
  //    obs:   5659b6b7...-systemapis.<suffix>
  const obsHost = deriveObsHost(vhost);

  return {
    componentId,
    versionId,
    environmentId,
    environmentName,
    releaseId,
    obsHost,
  };
}

function deriveObsHost(vhost: string): string {
  // Strip leading "<orgUuid>-<envName>." to get the suffix
  const firstDot = vhost.indexOf(".");
  if (firstDot < 0) throw new Error(`Unexpected vhost format: ${vhost}`);
  const suffix = vhost.slice(firstDot + 1);
  return `${OBS_HOST_ORG}-systemapis.${suffix}`;
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

async function checkUsageMetrics(
  token: string,
  t: Target,
  windowHours: number
): Promise<CheckResult> {
  const to = new Date();
  const from = new Date(to.getTime() - windowHours * 3600 * 1000);
  const url = `https://${t.obsHost}/systemapis/choreoobsapi/0.3.0/metrics/component/usage?releaseId=${t.releaseId}&from=${from.toISOString()}&to=${to.toISOString()}&breakSize=${BREAK_SIZE}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      Origin: "https://console.choreo.dev",
      Referer: "https://console.choreo.dev/",
    },
  });

  if (!res.ok) {
    return {
      name: "usage metrics (CPU/memory/network)",
      ok: false,
      detail: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
    };
  }
  const json: any = await res.json();
  const expected = ["cpuUsage", "memory", "bytesReceived", "bytesSent"];
  const missing = expected.filter((k) => !(k in json));
  if (missing.length) {
    return {
      name: "usage metrics (CPU/memory/network)",
      ok: false,
      detail: `missing keys: ${missing.join(", ")}`,
    };
  }
  const cpuPoints = (json.cpuUsage ?? []).length;
  const cpuNonZero = (json.cpuUsage ?? []).filter(
    (p: any) => p.value > 0
  ).length;
  const memNonZero = (json.memory ?? []).filter((p: any) => p.value > 0).length;
  return {
    name: "usage metrics (CPU/memory/network)",
    ok: true,
    detail: `${cpuPoints} datapoints — cpu>0: ${cpuNonZero}, mem>0: ${memNonZero}`,
  };
}

async function checkHttpMetrics(
  token: string,
  t: Target,
  windowHours: number
): Promise<CheckResult> {
  const to = new Date();
  const from = new Date(to.getTime() - windowHours * 3600 * 1000);
  const url = `https://${t.obsHost}/systemapis/choreoobsapi/0.3.0/metrics/component/http/?releaseId=${t.releaseId}&from=${from.toISOString()}&to=${to.toISOString()}&breakSize=${BREAK_SIZE}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      Origin: "https://console.choreo.dev",
      Referer: "https://console.choreo.dev/",
    },
  });

  if (!res.ok) {
    return {
      name: "http metrics (requests/latency)",
      ok: false,
      detail: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
    };
  }
  const json: any = await res.json();
  const data = json.data ?? json;
  const expected = ["totalRequestCountHistogram", "latencyMeanHistogram"];
  const missing = expected.filter((k) => !(k in data));
  if (missing.length) {
    return {
      name: "http metrics (requests/latency)",
      ok: false,
      detail: `missing keys: ${missing.join(", ")}`,
    };
  }
  const totalReqs = (data.totalRequestCountHistogram ?? []).reduce(
    (s: number, p: any) => s + (p.value ?? 0),
    0
  );
  return {
    name: "http metrics (requests/latency)",
    ok: true,
    detail: `total requests in window: ${totalReqs}`,
  };
}

async function checkApplicationLogs(
  token: string,
  t: Target,
  windowHours: number
): Promise<CheckResult> {
  const to = new Date();
  const from = new Date(to.getTime() - windowHours * 3600 * 1000);
  const url = `https://${t.obsHost}/systemapis/choreologgingapi/0.2.0/logs/component/application`;

  const body = {
    componentId: t.componentId,
    environmentId: t.environmentId,
    versionIdList: [t.versionId],
    region: "US",
    startTime: from.toISOString(),
    endTime: to.toISOString(),
    limit: 100,
    sort: "desc",
  };

  const res = await fetch(url, {
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

  if (!res.ok) {
    return {
      name: "application logs",
      ok: false,
      detail: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
    };
  }
  const json: any = await res.json();
  if (!("columns" in json) || !("rows" in json)) {
    return {
      name: "application logs",
      ok: false,
      detail: `unexpected shape: keys=${Object.keys(json).join(",")}`,
    };
  }
  return {
    name: "application logs",
    ok: true,
    detail: `rows: ${json.rows.length} (cols: ${json.columns.length})`,
  };
}

async function main() {
  const componentName = process.argv[2];
  const windowHours = parseInt(
    process.argv[3] ?? String(DEFAULT_WINDOW_HOURS),
    10
  );

  if (!componentName) {
    console.error(
      "Usage: npx tsx src/helpers/api-observability-tester.ts <component-name> [hours]"
    );
    process.exit(2);
  }

  const token = loadToken();

  console.log(`Resolving "${componentName}"...`);
  const target = await resolveTarget(token, componentName);
  console.log(`  componentId:   ${target.componentId}`);
  console.log(`  versionId:     ${target.versionId}`);
  console.log(`  environment:   ${target.environmentName} (${target.environmentId})`);
  console.log(`  releaseId:     ${target.releaseId}`);
  console.log(`  obs host:      ${target.obsHost}`);
  console.log(`  window:        ${windowHours}h\n`);

  const results: CheckResult[] = [];
  results.push(await checkUsageMetrics(token, target, windowHours));
  results.push(await checkHttpMetrics(token, target, windowHours));
  results.push(await checkApplicationLogs(token, target, windowHours));

  console.log("\n=== Observability check ===");
  for (const r of results) {
    const mark = r.ok ? "✓" : "✗";
    console.log(`  ${mark} ${r.name} — ${r.detail}`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`\n${failed.length}/${results.length} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} check(s) passed.`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
