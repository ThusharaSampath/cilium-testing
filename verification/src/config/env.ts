import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const required = [
  "CHOREO_CONSOLE_URL",
  "CHOREO_ORG_HANDLE",
  "CHOREO_PROJECT_NAME",
  "GITHUB_REPO_NAME",
  "GITHUB_BRANCH",
  "GOOGLE_ACCOUNT_NAME",
] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(
      `Missing required env var: ${key}. Copy .env.example to .env and fill in values.`
    );
  }
}

export const config = {
  consoleUrl: process.env.CHOREO_CONSOLE_URL!,
  orgHandle: process.env.CHOREO_ORG_HANDLE!,
  projectName: process.env.CHOREO_PROJECT_NAME!,
  githubRepo: process.env.GITHUB_REPO_NAME!,
  githubBranch: process.env.GITHUB_BRANCH!,
  googleAccountName: process.env.GOOGLE_ACCOUNT_NAME!,

  /** Max time in ms to poll for component builds before timing out */
  buildWaitMs: parseInt(process.env.BUILD_WAIT_MINUTES ?? "20") * 60 * 1000,

  get projectUrl() {
    return `${this.consoleUrl}/organizations/${this.orgHandle}/projects/${this.projectName}`;
  },
};
