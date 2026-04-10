import { Page } from "@playwright/test";
import { config } from "../config/env.js";
import { handleGoogleReloginIfNeeded } from "./google-relogin.js";

export interface ExistingComponent {
  id: string;
  name: string;
  handler: string;
  displayName: string;
  status: string;
  displayType: string;
}

/**
 * Fetches existing components in the project via the Choreo GraphQL API.
 * Captures the auth token from the browser's requests, then calls the
 * components query directly.
 */
export async function fetchExistingComponents(
  page: Page
): Promise<ExistingComponent[]> {
  // Set up token capture BEFORE navigating
  const tokenPromise = captureAuthToken(page);

  // Navigate to project home
  await page.goto(`${config.projectUrl}/home`);
  await handleGoogleReloginIfNeeded(page);

  // Wait for the page to actually load (Create button indicates home is ready)
  await page
    .locator('[data-cyid="create-new-component-button"]')
    .waitFor({ state: "visible", timeout: 60_000 });

  const token = await tokenPromise;

  const query = `query {
    components(orgHandler: "${config.orgHandle}", projectId: "${config.projectId}") {
      id
      name
      status
      handler
      displayName
      displayType
      componentSubType
    }
  }`;

  console.log(`Fetching components from: ${config.graphqlUrl}`);

  const response = await fetch(config.graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Origin: config.consoleUrl,
      Referer: `${config.consoleUrl}/`,
    },
    body: JSON.stringify({ query }),
  });

  const responseText = await response.text();
  console.log(`GraphQL response status: ${response.status}`);
  console.log(`GraphQL response body: ${responseText.substring(0, 500)}`);

  const data = JSON.parse(responseText);

  if (data?.errors) {
    console.error("GraphQL errors:", JSON.stringify(data.errors));
  }

  const components: ExistingComponent[] = data?.data?.components ?? [];

  console.log(`Found ${components.length} existing components in project:`);
  for (const c of components) {
    console.log(`  - ${c.handler} (${c.displayName}) [${c.status}]`);
  }

  return components;
}

/**
 * Captures the auth token from a request the page makes to the Choreo API.
 */
async function captureAuthToken(page: Page): Promise<string> {
  const apiHost = config.apiUrl.replace("https://", "");

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for a Choreo API request to capture auth token")),
      90_000
    );

    page.on("request", (request) => {
      if (request.url().includes(apiHost)) {
        const authHeader = request.headers()["authorization"];
        if (authHeader?.startsWith("Bearer ")) {
          clearTimeout(timeout);
          resolve(authHeader.replace("Bearer ", ""));
        }
      }
    });
  });
}
