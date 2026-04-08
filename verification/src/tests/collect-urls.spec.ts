import { test } from "@playwright/test";
import { collectUrls } from "../helpers/url-collector.js";
import fs from "fs";
import path from "path";

test("collect endpoint URLs from all components", async ({ page }) => {
  const collectedUrls = await collectUrls(page);

  // Save to file for use by other scripts
  const outputPath = path.resolve(__dirname, "../../collected-urls.json");
  fs.writeFileSync(outputPath, JSON.stringify(collectedUrls, null, 2));
  console.log(`Saved to ${outputPath}`);
});
