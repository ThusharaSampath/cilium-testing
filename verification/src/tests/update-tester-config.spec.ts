import { test } from "@playwright/test";
import { updateTesterConfig } from "../helpers/tester-config-updater.js";
import fs from "fs";
import path from "path";

test("update tester component config with collected URLs", async ({
  page,
}) => {
  // Load collected URLs
  const urlsPath = path.resolve(__dirname, "../../collected-urls.json");
  if (!fs.existsSync(urlsPath)) {
    throw new Error(
      `${urlsPath} not found. Run "npm run collect:urls" first.`
    );
  }
  const urls: Record<string, string> = JSON.parse(
    fs.readFileSync(urlsPath, "utf-8")
  );

  await updateTesterConfig(page, urls);
});
