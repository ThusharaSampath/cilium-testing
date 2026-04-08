import { test, expect } from "@playwright/test";
import { runTestConsole } from "../helpers/test-console-runner.js";

test("invoke /test endpoint from tester component test console", async ({
  page,
}) => {
  const responseBody = await runTestConsole(page, "tester", "/test");

  // Parse and validate the response
  const parsed = JSON.parse(responseBody);
  expect(parsed.service).toBe("tester");
  expect(parsed.results).toBeInstanceOf(Array);
  expect(parsed.results.length).toBe(4);

  // Log individual service results
  for (const result of parsed.results) {
    const status = result.error ? `ERROR: ${result.error}` : `OK (${result.status})`;
    console.log(`  ${result.name}: ${status}`);
  }
});
