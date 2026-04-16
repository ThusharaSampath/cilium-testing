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
  buildPreset:
    | "Go"
    | "Docker"
    | "Python"
    | "Java"
    | "NodeJS"
    | "Ballerina"
    | "React"
    | "Angular"
    | ".NET"
    | "Vue.js"
    | "PHP"
    | "Ruby"
    | "Spring Boot"
    | "Static Website";
  /** Component type in Choreo. Defaults to "Service" */
  componentType?: "Service" | "Web Application";
  /** Build command for web apps (e.g., "npm run build") */
  buildCommand?: string;
  /** Build output path for web apps (e.g., "/build") */
  buildPath?: string;
  /** Node version for web apps (e.g., "18.x") */
  nodeVersion?: string;
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
    name: "server",
    displayName: "server",
    sourceDirectory: "service-to-service/project-level/server",
    networkVisibility: "Project",
    buildPreset: "Go",
  },
  {
    name: "client",
    displayName: "client",
    sourceDirectory: "service-to-service/project-level/client",
    networkVisibility: "Public",
    buildPreset: "Go",
    connections: [
      {
        name: "client-to-server",
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
    note: "Requires manual configuration of ORG_SERVICE_URL, PUBLIC_SERVICE_URL, PROJECT_SERVICE_URL, WEBAPP_URL env vars in Choreo after creation",
  },
  {
    name: "react-single-page-app",
    displayName: "React Single Page App",
    sourceDirectory: "react-single-page-app",
    networkVisibility: "Public",
    buildPreset: "React",
    componentType: "Web Application",
    buildCommand: "npm run build",
    buildPath: "/build",
    nodeVersion: "18",
  },
];
