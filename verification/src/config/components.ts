export interface ComponentDefinition {
  name: string;
  displayName: string;
  sourceDirectory: string;
  networkVisibility: "Public" | "Organization" | "Project";
  note?: string;
}

export const components: ComponentDefinition[] = [
  {
    name: "error-responder",
    displayName: "Error Responder",
    sourceDirectory: "error-responder",
    networkVisibility: "Public",
  },
  {
    name: "org-service",
    displayName: "Org Service",
    sourceDirectory: "org-service",
    networkVisibility: "Organization",
  },
  {
    name: "project-service",
    displayName: "Project Service",
    sourceDirectory: "project-service",
    networkVisibility: "Project",
  },
  {
    name: "public-service",
    displayName: "Public Service",
    sourceDirectory: "public-service",
    networkVisibility: "Public",
  },
  {
    name: "proxy-service",
    displayName: "Proxy Service",
    sourceDirectory: "proxy-service",
    networkVisibility: "Public",
  },
  {
    name: "project-level-server",
    displayName: "Project Level Server",
    sourceDirectory: "service-to-service/project-level/server",
    networkVisibility: "Project",
  },
  {
    name: "project-level-client",
    displayName: "Project Level Client",
    sourceDirectory: "service-to-service/project-level/client",
    networkVisibility: "Public",
    note: "Requires manual server-connection configuration in Choreo after creation",
  },
];
