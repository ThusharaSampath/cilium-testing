/**
 * Connection configuration consumed by `api-connection-creator.ts` (and the
 * legacy Playwright fallback). Component creation itself is driven by
 * `api-components.ts` via GraphQL.
 */

export interface ConnectionDefinition {
  /** Name for the connection (e.g., "tester-to-org") */
  name: string;
  /** Display name of the target service to look up in the marketplace (e.g., "org-service") */
  targetServiceName: string;
}

export interface ComponentConnections {
  name: string;
  connections?: ConnectionDefinition[];
}

export const components: ComponentConnections[] = [
  {
    name: "tester",
    connections: [
      { name: "tester-to-org", targetServiceName: "org-service" },
      { name: "tester-to-public", targetServiceName: "public-service" },
      { name: "tester-to-project", targetServiceName: "project-service" },
    ],
  },
];
