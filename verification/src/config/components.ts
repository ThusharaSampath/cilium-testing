export interface ComponentDefinition {
  name: string;
  displayName: string;
  sourceDirectory: string;
  networkVisibility: "Public" | "Organization" | "Project";
  buildPreset: "Go" | "Docker" | "Python" | "Java" | "NodeJS" | "Ballerina";
  note?: string;
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
    note: "Requires manual server-connection configuration in Choreo after creation",
  },
];
