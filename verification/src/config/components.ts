/**
 * Connection configuration consumed by the connection-creator Playwright specs.
 * Component creation itself is driven by `api-components.ts` via GraphQL.
 */

export interface ConnectionDefinition {
  /** Name for the connection (e.g., "client-to-server") */
  name: string;
  /** Display name of the target service to select (e.g., "server") */
  targetServiceName: string;
}

export interface ComponentConnections {
  name: string;
  connections?: ConnectionDefinition[];
}

export const components: ComponentConnections[] = [
  {
    name: "client",
    connections: [
      { name: "client-to-server", targetServiceName: "server" },
    ],
  },
  {
    name: "tester",
    connections: [
      { name: "tester-to-org", targetServiceName: "org-service" },
      { name: "tester-to-public", targetServiceName: "public-service" },
      { name: "tester-to-project", targetServiceName: "project-service" },
    ],
  },
];
