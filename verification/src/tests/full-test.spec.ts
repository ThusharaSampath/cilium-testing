import { test, expect } from "@playwright/test";
import { runTestConsole } from "../helpers/test-console-runner.js";

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const allResults: TestResult[] = [];

test.describe.serial("Full Verification Test", () => {
  test("Test 1: Tester /test endpoint", async ({ page }) => {
    const responseBody = await runTestConsole(page, "tester", "/test");
    const parsed = JSON.parse(responseBody);

    expect(parsed.service).toBe("tester");
    expect(parsed.results).toBeInstanceOf(Array);
    expect(parsed.results.length).toBe(4);

    for (const result of parsed.results) {
      const passed =
        !result.error && result.status >= 200 && result.status < 300;
      allResults.push({
        name: `tester → ${result.name}`,
        passed,
        details: result.error
          ? `ERROR: ${result.error}`
          : `HTTP ${result.status}`,
      });
    }
  });

  test("Test 2: S2S client /hello endpoint", async ({ page }) => {
    const responseBody = await runTestConsole(
      page,
      "project-level-client",
      "/hello"
    );
    const parsed = JSON.parse(responseBody);

    const passed = parsed.server_status >= 200 && parsed.server_status < 300;
    allResults.push({
      name: "s2s-client → server",
      passed,
      details: passed
        ? `HTTP ${parsed.server_status}`
        : `HTTP ${parsed.server_status}: ${JSON.stringify(parsed.server_payload)}`,
    });
  });

  test("Report: Final results", async () => {
    const allPassed = allResults.every((r) => r.passed);

    console.log("\n╔══════════════════════════════════════════════════╗");
    console.log("║          FULL VERIFICATION - RESULTS             ║");
    console.log("╠══════════════════════════════════════════════════╣");
    for (const r of allResults) {
      const icon = r.passed ? "PASS" : "FAIL";
      console.log(`║  [${icon}] ${r.name}: ${r.details}`);
    }
    console.log("╠══════════════════════════════════════════════════╣");
    console.log(
      `║  OVERALL: ${allPassed ? "ALL PASSED" : "SOME FAILED"} (${allResults.filter((r) => r.passed).length}/${allResults.length})`
    );
    console.log("╚══════════════════════════════════════════════════╝\n");

    for (const r of allResults) {
      expect(r.passed, `${r.name} should pass`).toBe(true);
    }
  });
});
