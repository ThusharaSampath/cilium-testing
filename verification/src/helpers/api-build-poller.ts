/**
 * Polls Choreo component build status via GraphQL API (no browser needed).
 *
 * Usage:
 *   npx tsx src/helpers/api-build-poller.ts <comma-separated-component-names>
 *
 * Steps:
 *   1. Load cached STS token from .choreo-token.json
 *   2. Fetch all components with deploymentTracks to get componentId + versionId
 *   3. Poll deploymentStatusByVersion for each target component in parallel
 *   4. Exit 0 when all succeed, exit 1 on failure/timeout
 */

import * as fs from "fs";
import * as path from "path";
import { config } from "../config/env.js";

const TOKEN_FILE = path.resolve(__dirname, "../../.choreo-token.json");
const GRAPHQL_URL = "https://apis.choreo.dev/projects/1.0.0/graphql";
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS =
  parseInt(process.env.BUILD_WAIT_MINUTES ?? "15") * 60 * 1000;

function loadToken(): string {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error("No token file found. Run `npm run capture:token` first.");
  }
  const data = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
  const ageMs = Date.now() - data.capturedAt;
  const validMs = data.expiresIn * 1000 - 5 * 60 * 1000;
  if (ageMs >= validMs) {
    throw new Error("Token expired. Run `npm run capture:token` to refresh.");
  }
  return data.token;
}

interface ComponentInfo {
  id: string;
  handler: string;
  versionId: string;
}

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

async function fetchComponentInfos(
  token: string,
  targetNames: string[]
): Promise<ComponentInfo[]> {
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

  const all: {
    id: string;
    handler: string;
    deploymentTracks: { id: string }[];
  }[] = data.components ?? [];

  const targetSet = new Set(targetNames);
  const results: ComponentInfo[] = [];
  const found = new Set<string>();

  for (const comp of all) {
    if (targetSet.has(comp.handler)) {
      if (!comp.deploymentTracks?.length) {
        throw new Error(
          `Component "${comp.handler}" has no deployment tracks`
        );
      }
      results.push({
        id: comp.id,
        handler: comp.handler,
        versionId: comp.deploymentTracks[0].id,
      });
      found.add(comp.handler);
    }
  }

  const missing = targetNames.filter((n) => !found.has(n));
  if (missing.length > 0) {
    throw new Error(
      `Components not found in project: ${missing.join(", ")}`
    );
  }

  return results;
}

async function pollOne(
  token: string,
  comp: ComponentInfo
): Promise<{ name: string; success: boolean; error?: string }> {
  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > POLL_TIMEOUT_MS) {
      return {
        name: comp.handler,
        success: false,
        error: `Timed out after ${POLL_TIMEOUT_MS / 60000} minutes`,
      };
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
        `  ${comp.handler}: status=${latest.status}, conclusion=${conclusion || "(pending)"}`
      );

      if (latest.status === "completed") {
        if (conclusion === "success") {
          return { name: comp.handler, success: true };
        } else {
          return {
            name: comp.handler,
            success: false,
            error: `Build failed: conclusion=${conclusion}`,
          };
        }
      }
    } else {
      console.log(`  ${comp.handler}: no builds yet`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

async function main() {
  const componentNames = (process.argv[2] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (componentNames.length === 0) {
    console.error(
      "Usage: npx tsx src/helpers/api-build-poller.ts <comp1,comp2,...>"
    );
    process.exit(1);
  }

  const token = loadToken();

  console.log(`Fetching component info for: ${componentNames.join(", ")}...`);
  const infos = await fetchComponentInfos(token, componentNames);

  for (const info of infos) {
    console.log(
      `  ${info.handler}: componentId=${info.id}, versionId=${info.versionId}`
    );
  }

  console.log(
    `\nPolling builds (interval=${POLL_INTERVAL_MS / 1000}s, timeout=${POLL_TIMEOUT_MS / 60000}min)...\n`
  );

  // Poll all components in parallel
  const results = await Promise.all(
    infos.map((info) => pollOne(token, info))
  );

  // Summary
  console.log("\n=== Build Summary ===");
  for (const r of results) {
    const status = r.success ? "✓" : "✗";
    const detail = r.success ? "succeeded" : r.error;
    console.log(`  ${status} ${r.name}: ${detail}`);
  }

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    console.log(`\n${failed.length} build(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll builds succeeded.");
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
