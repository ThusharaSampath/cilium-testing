/**
 * Component definitions for API-based creation via GraphQL.
 *
 * Two mutation types:
 *   - "buildpackService" → createBuildpackComponent (Go services)
 *   - "byocWebAppsDockerfileLess" → createByocComponent (React/webapp)
 *
 * Groups:
 *   - "tester" → org-service, public-service, project-service, react-single-page-app, tester
 */

export interface ApiComponentDefinition {
  name: string;
  displayName: string;
  /** Source directory in the GitHub repo */
  buildContext: string;
  /** external = Public, org = Organization, project = Project */
  accessibility: "external" | "org" | "project";
  /** Which track this component belongs to */
  group: "tester";

  /**
   * Determines which GraphQL mutation to use:
   *   - "buildpackService" → createBuildpackComponent
   *   - "byocWebAppsDockerfileLess" → createByocComponent
   */
  componentType: "buildpackService" | "byocWebAppsDockerfileLess";

  /** Buildpack-specific fields (for services) */
  buildpack?: {
    languageVersion: string;
    /** Go buildpack ID */
    buildpackId: string;
  };

  /** Web app-specific fields */
  webApp?: {
    webAppType: string;
    buildCommand: string;
    packageManagerVersion: string;
    outputDirectory: string;
  };
}

const GO_BUILDPACK_ID = "F9E4820E-6284-11EE-8C99-0242AC120005";

function goService(
  name: string,
  buildContext: string,
  accessibility: "external" | "org" | "project",
  group: "tester"
): ApiComponentDefinition {
  return {
    name,
    displayName: name,
    buildContext,
    accessibility,
    group,
    componentType: "buildpackService",
    buildpack: { languageVersion: "1.x", buildpackId: GO_BUILDPACK_ID },
  };
}

export const apiComponents: ApiComponentDefinition[] = [
  // --- Tester track (5 components) ---
  goService("org-service", "org-service", "org", "tester"),
  goService("public-service", "public-service", "external", "tester"),
  goService("project-service", "project-service", "project", "tester"),
  {
    name: "react-single-page-app",
    displayName: "react-single-page-app",
    buildContext: "react-single-page-app",
    accessibility: "external",
    group: "tester",
    componentType: "byocWebAppsDockerfileLess",
    webApp: {
      webAppType: "React",
      buildCommand: "npm run build",
      packageManagerVersion: "18",
      outputDirectory: "/build",
    },
  },
  goService("tester", "tester", "project", "tester"),
];

/** Get components for a specific track */
export function getComponentsByGroup(group: "tester"): ApiComponentDefinition[] {
  return apiComponents.filter((c) => c.group === group);
}
