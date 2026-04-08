import { Page } from "@playwright/test";

export interface ComponentBuildInfo {
  name: string;
  componentId: string;
  versionId: string;
  componentUrl: string;
}

export interface CapturedBuildDetails {
  token: string;
  apiUrl: string;
  components: ComponentBuildInfo[];
}

/**
 * Intercepts the deploymentStatusByVersion GraphQL call on a component's
 * overview page to capture componentId, versionId, and auth token.
 *
 * Must be called BEFORE navigating to the overview page (sets up listener).
 */
export async function captureDeploymentDetails(
  page: Page,
  componentName: string,
  componentUrl: string
): Promise<{ componentId: string; versionId: string; token: string; apiUrl: string }> {
  const captured = await new Promise<{
    componentId: string;
    versionId: string;
    token: string;
    apiUrl: string;
  }>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for deploymentStatusByVersion call for ${componentName}`)),
      60_000
    );

    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/graphql")
      ) {
        try {
          const postData = request.postDataJSON();
          if (
            postData?.query &&
            postData.query.includes("deploymentStatusByVersion")
          ) {
            // Extract IDs from the query string
            const versionIdMatch = postData.query.match(
              /versionId:\s*"([^"]+)"/
            );
            const componentIdMatch = postData.query.match(
              /componentId:\s*"([^"]+)"/
            );

            if (versionIdMatch && componentIdMatch) {
              clearTimeout(timeout);
              resolve({
                componentId: componentIdMatch[1],
                versionId: versionIdMatch[1],
                token: request.headers()["authorization"]?.replace("Bearer ", "") ?? "",
                apiUrl: request.url(),
              });
            }
          }
        } catch {
          // ignore non-JSON requests
        }
      }
    });
  });

  console.log(`  Captured build details for ${componentName}:`);
  console.log(`    componentId: ${captured.componentId}`);
  console.log(`    versionId: ${captured.versionId}`);

  return captured;
}

/**
 * Polls the deploymentStatusByVersion GraphQL endpoint until the latest
 * build reaches "completed" status with "success" conclusion.
 */
export async function pollBuildStatus(
  details: CapturedBuildDetails,
  pollIntervalMs: number = 30_000,
  timeoutMs: number = 20 * 60 * 1000
): Promise<void> {
  const startTime = Date.now();

  for (const comp of details.components) {
    console.log(`\nPolling build status for: ${comp.name}`);
    let completed = false;

    while (!completed) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(
          `Build polling timed out after ${timeoutMs / 60000} minutes. Component: ${comp.name}`
        );
      }

      const query = `query {
      deploymentStatusByVersion(
        versionId: "${comp.versionId}",
        componentId: "${comp.componentId}",
        )
      {
        status
        conclusion
        conclusionV2
      }
    }`;

      const response = await fetch(details.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${details.token}`,
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      const builds = data?.data?.deploymentStatusByVersion;

      if (builds && builds.length > 0) {
        const latest = builds[0];
        console.log(
          `  ${comp.name}: status=${latest.status}, conclusion=${latest.conclusionV2 ?? latest.conclusion}`
        );

        if (latest.status === "completed") {
          if (latest.conclusionV2 === "success" || latest.conclusion === "success") {
            console.log(`  ${comp.name}: Build succeeded!`);
            completed = true;
          } else {
            throw new Error(
              `Build failed for ${comp.name}: conclusion=${latest.conclusionV2 ?? latest.conclusion}`
            );
          }
        }
      }

      if (!completed) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }
  }

  console.log("\nAll component builds completed successfully!");
}
