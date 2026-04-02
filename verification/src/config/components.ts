export interface ConnectionDefinition {
  /** Name for the connection (e.g., "client-to-server") */
  name: string;
  /** Display name of the target service to select (e.g., "server") */
  targetServiceName: string;
}

export interface ComponentDefinition {
  name: string;
  displayName: string;
  sourceDirectory: string;
  networkVisibility: "Public" | "Organization" | "Project";
  buildPreset: "Go" | "Docker" | "Python" | "Java" | "NodeJS" | "Ballerina";
  note?: string;
  /** Connections to create after the component is deployed */
  connections?: ConnectionDefinition[];
}

export const components: ComponentDefinition[] = [
  {
    name: "error-responder",
    displayName: "Error Responder",
    sourceDirectory: "error-responder",
    networkVisibility: "Public",
    buildPreset: "Go",
  },
  {
    name: "org-service",
    displayName: "Org Service",
    sourceDirectory: "org-service",
    networkVisibility: "Organization",
    buildPreset: "Go",
  },
  {
    name: "project-service",
    displayName: "Project Service",
    sourceDirectory: "project-service",
    networkVisibility: "Project",
    buildPreset: "Go",
  },
  {
    name: "public-service",
    displayName: "Public Service",
    sourceDirectory: "public-service",
    networkVisibility: "Public",
    buildPreset: "Go",
  },
  {
    name: "proxy-service",
    displayName: "Proxy Service",
    sourceDirectory: "proxy-service",
    networkVisibility: "Public",
    buildPreset: "Go",
  },
  {
    name: "project-level-server",
    displayName: "Project Level Server",
    sourceDirectory: "service-to-service/project-level/server",
    networkVisibility: "Project",
    buildPreset: "Go",
  },
  {
    name: "project-level-client",
    displayName: "Project Level Client",
    sourceDirectory: "service-to-service/project-level/client",
    networkVisibility: "Public",
    buildPreset: "Go",
    connections: [
      {
        name: "client-to-server-con",
        targetServiceName: "server",
      },
    ],
  },
  {
    name: "tester",
    displayName: "Tester Service",
    sourceDirectory: "tester",
    networkVisibility: "Project",
    buildPreset: "Go",
    note: "Requires manual configuration of ORG_SERVICE_URL, PUBLIC_SERVICE_URL, PROJECT_SERVICE_URL env vars in Choreo after creation",
  },
];
