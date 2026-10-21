import { describe, expect, it } from "vitest";
import { formatReport, runEvaluations } from "./runner";
import { loadEnvFile } from "./runner";

/**
 * AI evaluation suite (blueprint §15).
 *
 * Run with: npm run eval
 * Live model scenarios are included automatically when EVAL_BASE_URL and
 * EVAL_WIDGET_KEY are configured (they are soft checks).
 */
describe("AI evaluation suite", () => {
  it("passes every hard scenario", async () => {
    loadEnvFile();
    const report = await runEvaluations({
      includeLive: Boolean(
        process.env.EVAL_BASE_URL && process.env.EVAL_WIDGET_KEY
      ),
    });

    // eslint-disable-next-line no-console
    console.log(`\n${formatReport(report)}\n`);

    const hardFailures = report.results.filter(
      (r) => r.status === "failed" && r.weight === "hard"
    );
    const softFailures = report.results.filter(
      (r) => r.status === "failed" && r.weight === "soft"
    );

    if (softFailures.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `${softFailures.length} soft (live model) scenario(s) failed: ${softFailures
          .map((f) => f.id)
          .join(", ")}`
      );
    }

    expect(
      hardFailures.map((f) => `${f.id}: ${f.description}`)
    ).toEqual([]);
    expect(report.total).toBeGreaterThan(50);
  }, 120_000);
});
