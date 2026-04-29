/**
 * Deletes leftover Choreo components in the configured project via GraphQL.
 *
 * Usage:
 *   npx tsx src/helpers/api-component-cleanup.ts [tester|all]
 *
 * Choreo refuses to delete a component that is the TARGET of a connection
 * (e.g., `org-service` while `tester` still has a connection to it). To handle
 * that, this script:
 *
 *   1. Lists all components in the project.
 *   2. For each candidate component, fetches its outgoing connections via the
 *      connections REST API and builds a directed graph: source -> target.
 *   3. Performs a topological-style delete: repeatedly delete every component
 *      that is NOT currently a target of any remaining component, until
 *      nothing is left (or no progress is possible).
 *   4. Falls back to the `canDelete` field returned by `deleteComponentV2` if
 *      the connections API misses something — components that can't be deleted
 *      yet are deferred to the next pass.
 */

import { config } from "../config/env.js";
import { apiComponents } from "../config/api-components.js";
import { loadToken } from "./token-loader.js";

const GRAPHQL_URL = config.graphqlUrl;
const CONNECTIONS_API_URL =
  "https://apis.choreo.dev/connections/v1.0/configurations/service-configs/connections";
const DELAY_BETWEEN_DELETES_MS = 3_000;
const MAX_PASSES = 5;

interface ComponentRecord {
  id: string;
  name: string;
  handler: string;
}

function authHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    Origin: "https://console.choreo.dev",
    Referer: "https://console.choreo.dev/",
  };
}

async function fetchProjectComponents(token: string): Promise<ComponentRecord[]> {
  const query = `query {
    components(orgHandler: "${config.orgHandle}", projectId: "${config.projectId}") {
      id
      name
      handler
    }
  }`;

  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`components query HTTP ${response.status}: ${text}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(
      `components query errors: ${json.errors.map((e: any) => e.message).join("; ")}`
    );
  }
  return (json.data?.components ?? []) as ComponentRecord[];
}

/**
 * Returns the set of component handlers/names this component connects TO.
 * Connection objects in this API expose the target service via fields that
 * vary per Choreo version; we extract any plausible handler/name field.
 */
async function fetchOutgoingTargets(
  token: string,
  componentId: string
): Promise<Set<string>> {
  const url = `${CONNECTIONS_API_URL}?projectId=${config.projectId}&componentId=${componentId}`;
  const response = await fetch(url, { headers: authHeaders(token) });

  if (!response.ok) {
    // Treat as no connections rather than fail; topo loop has a fallback.
    return new Set();
  }

  const connections: any[] = await response.json();
  const targets = new Set<string>();
  for (const c of connections) {
    const candidates = [
      c.targetComponentHandler,
      c.targetComponentName,
      c.targetServiceName,
      c.serviceIdentifier?.componentHandler,
      c.serviceIdentifier?.componentName,
    ];
    for (const v of candidates) {
      if (typeof v === "string" && v.length > 0) targets.add(v);
    }
  }
  return targets;
}

async function deleteComponent(
  token: string,
  comp: ComponentRecord
): Promise<{
  ok: boolean;
  canDelete?: boolean;
  status?: string;
  message?: string;
  error?: string;
}> {
  const mutation = `mutation {
    deleteComponentV2(
      orgHandler: "${config.orgHandle}",
      componentId: "${comp.id}",
      projectId: "${config.projectId}"
    ) {
      status
      canDelete
      message
      encodedData
    }
  }`;

  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ query: mutation }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `HTTP ${response.status}: ${text}` };
  }

  const json = await response.json();
  if (json.errors) {
    return {
      ok: false,
      error: json.errors.map((e: any) => e.message).join("; "),
    };
  }

  const data = json.data?.deleteComponentV2 ?? {};
  return {
    ok: data.canDelete !== false && data.status !== "FAILED",
    canDelete: data.canDelete,
    status: data.status,
    message: data.message,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const group = process.argv[2] as "tester" | "all" | undefined;

  // Restrict the cleanup set to components this repo manages, unless "all".
  const knownNames = new Set(
    group === "tester"
      ? apiComponents.filter((c) => c.group === "tester").map((c) => c.name)
      : apiComponents.map((c) => c.name)
  );

  const token = loadToken();

  console.log(
    `Cleanup target: ${group ?? "all"} (org=${config.orgHandle}, project=${config.projectId})`
  );

  const allComponents = await fetchProjectComponents(token);
  const candidates = allComponents.filter(
    (c) => knownNames.has(c.name) || knownNames.has(c.handler)
  );

  if (candidates.length === 0) {
    console.log("No leftover components to delete.");
    return;
  }

  console.log(
    `Found ${candidates.length} component(s) to consider: ${candidates
      .map((c) => c.name)
      .join(", ")}\n`
  );

  // Build outgoing-target map per component. Anything that appears as a
  // target of someone still in `remaining` cannot be deleted yet.
  console.log("Resolving connections for delete order...");
  const outgoing = new Map<string, Set<string>>();
  for (const c of candidates) {
    const targets = await fetchOutgoingTargets(token, c.id);
    outgoing.set(c.id, targets);
    if (targets.size > 0) {
      console.log(`  ${c.name} -> [${[...targets].join(", ")}]`);
    }
  }
  console.log("");

  let remaining = [...candidates];
  const failed: { name: string; error: string }[] = [];

  for (let pass = 1; pass <= MAX_PASSES && remaining.length > 0; pass++) {
    // A component is "blocked" if any other remaining component connects to it.
    const remainingNames = new Set(
      remaining.flatMap((c) => [c.name, c.handler])
    );
    const blocked = new Set<string>();
    for (const c of remaining) {
      for (const t of outgoing.get(c.id) ?? []) {
        if (remainingNames.has(t)) blocked.add(t);
      }
    }

    const deletable = remaining.filter(
      (c) => !blocked.has(c.name) && !blocked.has(c.handler)
    );

    if (deletable.length === 0) {
      console.log(
        `Pass ${pass}: no deletable component (all remaining are connection targets). Aborting loop.`
      );
      break;
    }

    console.log(
      `=== Pass ${pass}: deleting ${deletable.length} component(s) — ${deletable
        .map((c) => c.name)
        .join(", ")} ===`
    );

    const stillRemaining: ComponentRecord[] = remaining.filter(
      (c) => !deletable.includes(c)
    );

    for (let i = 0; i < deletable.length; i++) {
      const comp = deletable[i];
      console.log(`[${i + 1}/${deletable.length}] Deleting "${comp.name}" (id=${comp.id})...`);
      const result = await deleteComponent(token, comp);

      if (result.ok) {
        console.log(`  ✓ Deleted (status=${result.status ?? "OK"})`);
      } else if (result.canDelete === false) {
        // Server says it's still a target — keep it for a later pass.
        console.log(
          `  ⏭  Cannot delete yet: ${result.message ?? "canDelete=false"} — deferring`
        );
        stillRemaining.push(comp);
      } else {
        console.log(`  ✗ Failed: ${result.error ?? result.message ?? "unknown"}`);
        failed.push({
          name: comp.name,
          error: result.error ?? result.message ?? "unknown",
        });
      }

      if (i < deletable.length - 1) {
        await sleep(DELAY_BETWEEN_DELETES_MS);
      }
    }

    remaining = stillRemaining;
    console.log("");
  }

  console.log("=== Summary ===");
  if (remaining.length === 0 && failed.length === 0) {
    console.log("All targeted components deleted.");
    return;
  }
  if (remaining.length > 0) {
    console.log(
      `Not deleted (still blocked or deferred): ${remaining.map((c) => c.name).join(", ")}`
    );
  }
  if (failed.length > 0) {
    for (const f of failed) console.log(`  ✗ ${f.name}: ${f.error}`);
    process.exit(1);
  }
  if (remaining.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
