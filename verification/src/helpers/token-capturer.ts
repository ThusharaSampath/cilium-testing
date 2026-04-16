import { type Page } from "@playwright/test";
import { config } from "../config/env.js";
import { handleGoogleReloginIfNeeded } from "./google-relogin.js";
import * as fs from "fs";
import * as path from "path";

const TOKEN_FILE = path.resolve(__dirname, "../../.choreo-token.json");

interface CapturedToken {
  token: string;
  capturedAt: number;
  expiresIn: number;
}

/**
 * Captures the Choreo STS access token by intercepting the
 * POST sts.choreo.dev/oauth2/token response during page navigation.
 *
 * The Choreo console auth flow:
 *   1. Asgardeo issues an access token (authorization_code grant)
 *   2. Console exchanges it at sts.choreo.dev/oauth2/token (token-exchange grant)
 *   3. The STS token is used as Bearer token for all apis.choreo.dev calls
 *
 * This helper intercepts step 2's response to reliably capture the token.
 */
export async function captureStsToken(page: Page): Promise<string> {
  // Check if we have a valid cached token
  const cached = loadCachedToken();
  if (cached) {
    console.log("Using cached STS token (still valid).");
    return cached;
  }

  console.log("Capturing STS token from browser...");

  // Derive STS URL from console URL: console.choreo.dev -> sts.choreo.dev
  const stsHost = config.consoleUrl
    .replace(/consolev?2?/, "sts")
    .replace(/https?:\/\//, "");

  // Set up response interceptor BEFORE navigating
  const tokenPromise = new Promise<CapturedToken>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for STS token exchange (90s)")),
      90_000
    );

    page.on("response", async (response) => {
      const url = response.url();
      if (
        response.request().method() === "POST" &&
        url.includes(stsHost) &&
        url.includes("/oauth2/token")
      ) {
        try {
          const body = await response.json();
          if (body.access_token) {
            clearTimeout(timeout);
            resolve({
              token: body.access_token,
              capturedAt: Date.now(),
              expiresIn: body.expires_in ?? 3600,
            });
          }
        } catch {
          // Not JSON or missing access_token — ignore, wait for next response
        }
      }
    });
  });

  // Navigate to project home — may redirect to Google sign-in
  console.log(`[token] Navigating to: ${config.projectUrl}/home`);
  await page.goto(`${config.projectUrl}/home`, { waitUntil: "commit" });

  // Wait for page to settle (Choreo → Asgardeo → Google redirect chain)
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  console.log(`[token] Page loaded. URL: ${page.url()}`);

  // Handle Google re-login if session expired
  await handleGoogleReloginIfNeeded(page);
  console.log(`[token] After relogin check. URL: ${page.url()}`);

  // Wait for the STS token exchange to complete
  console.log("[token] Waiting for STS token exchange...");
  const captured = await tokenPromise;

  // Save to file for reuse across steps
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(captured, null, 2));
  console.log(`STS token captured and saved (expires in ${captured.expiresIn}s).`);

  return captured.token;
}

/**
 * Loads a previously captured token if it's still valid (with 5 min buffer).
 */
function loadCachedToken(): string | null {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return null;

    const data: CapturedToken = JSON.parse(
      fs.readFileSync(TOKEN_FILE, "utf-8")
    );

    const ageMs = Date.now() - data.capturedAt;
    const bufferMs = 5 * 60 * 1000; // 5 minute safety buffer
    const validMs = data.expiresIn * 1000 - bufferMs;

    if (ageMs < validMs) {
      return data.token;
    }

    console.log("Cached STS token expired, will recapture.");
    return null;
  } catch {
    return null;
  }
}
