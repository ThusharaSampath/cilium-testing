/**
 * Shared token loader for API scripts.
 *
 * Loads the cached STS token from .choreo-token.json.
 * If expired or missing, automatically runs `npx playwright test --project=capture-token`
 * (headed browser, reuses saved Google session) to refresh it.
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const TOKEN_FILE = path.resolve(__dirname, "../../.choreo-token.json");
const VERIFY_ROOT = path.resolve(__dirname, "../..");

interface CachedToken {
  token: string;
  capturedAt: number;
  expiresIn: number;
}

function readCachedToken(): string | null {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return null;

    const data: CachedToken = JSON.parse(
      fs.readFileSync(TOKEN_FILE, "utf-8")
    );

    const ageMs = Date.now() - data.capturedAt;
    const validMs = data.expiresIn * 1000 - 5 * 60 * 1000; // 5 min buffer

    if (ageMs < validMs) {
      return data.token;
    }

    console.log("Cached STS token expired.");
    return null;
  } catch {
    return null;
  }
}

function refreshToken(): void {
  console.log("Refreshing STS token via browser (using saved session)...");
  try {
    execSync("npx playwright test --project=capture-token", {
      cwd: VERIFY_ROOT,
      stdio: "inherit",
      timeout: 120_000,
    });
  } catch (err) {
    throw new Error(
      "Token refresh failed. Your Google session may have expired — run `npm run login` first."
    );
  }
}

/**
 * Returns a valid STS token, auto-refreshing via Playwright if needed.
 */
export function loadToken(): string {
  let token = readCachedToken();
  if (token) return token;

  refreshToken();

  token = readCachedToken();
  if (!token) {
    throw new Error(
      "Token file missing after refresh. Run `npm run login` to re-authenticate."
    );
  }
  return token;
}
