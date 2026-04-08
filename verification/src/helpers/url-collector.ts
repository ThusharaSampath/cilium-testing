import { Page, expect } from "@playwright/test";
import { config } from "../config/env.js";
import { handleGoogleReloginIfNeeded } from "./google-relogin.js";

interface UrlTarget {
  component: string;
  envVar: string;
  visibility?: string;
  type?: "webapp";
}

const urlTargets: UrlTarget[] = [
  {
    component: "org-service",
    envVar: "ORG_SERVICE_URL",
    visibility: "Organization",
  },
  {
    component: "public-service",
    envVar: "PUBLIC_SERVICE_URL",
    visibility: "Public",
  },
  {
    component: "project-service",
    envVar: "PROJECT_SERVICE_URL",
    visibility: "Project",
  },
  {
    component: "react-single-page-app",
    envVar: "WEBAPP_URL",
    type: "webapp",
  },
];

export async function collectUrls(
  page: Page
): Promise<Record<string, string>> {
  const collectedUrls: Record<string, string> = {};

  for (const target of urlTargets) {
    const overviewUrl = `${config.projectUrl}/components/${target.component}/overview`;
    await page.goto(overviewUrl);
    await page.waitForLoadState("networkidle");
    await handleGoogleReloginIfNeeded(page);

    let url: string;

    if (target.type === "webapp") {
      // Close Copilot popup if it appears
      const copilotClose = page.locator('button[aria-label="Close"]');
      if (
        await copilotClose.isVisible({ timeout: 3_000 }).catch(() => false)
      ) {
        await copilotClose.click();
      }

      // Scroll down to make the URL section visible
      await page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight)
      );
      await page.waitForTimeout(1_000);

      // Web app: URL is in a readonly input with id="text-field-endpoint"
      const urlInput = page.locator("#text-field-endpoint");
      await urlInput.waitFor({ state: "visible", timeout: 120_000 });
      url = (await urlInput.inputValue()).trim();
    } else {
      // Service: find the Endpoints table row matching the target visibility
      const row = page
        .locator("tr")
        .filter({ hasText: target.visibility! });
      await row.first().waitFor({ state: "visible", timeout: 30_000 });

      // The URL cell contains the URL text followed by a copy button
      const urlCell = row.first().locator("td").filter({
        has: page.locator(
          'button[data-cyid="copy-invoke-url-icon-button"]'
        ),
      });
      const cellText = await urlCell.textContent();
      url = cellText!
        .replace(/^(Project|Public|Organization):\s*/i, "")
        .trim();
    }

    console.log(`${target.envVar} = ${url}`);
    collectedUrls[target.envVar] = url;
  }

  console.log("\n=== Collected URLs ===");
  console.log(JSON.stringify(collectedUrls, null, 2));
  console.log("=== End URLs ===");

  // Validate all URLs were collected
  for (const target of urlTargets) {
    expect(
      collectedUrls[target.envVar],
      `${target.envVar} should be collected`
    ).toBeTruthy();
  }

  return collectedUrls;
}
