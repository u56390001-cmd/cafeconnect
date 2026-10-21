import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type { EvalReport, EvalResult, EvalScenario } from "./types";

const SUITES: Array<() => Promise<EvalScenario[]>> = [
  async () => (await import("./suites/core.suite")).coreScenarios,
  async () => (await import("./suites/integration.suite")).integrationScenarios,
];

function hasFirestoreCredentials(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );
}

function hasLiveConfig(): boolean {
  return Boolean(process.env.EVAL_BASE_URL && process.env.EVAL_WIDGET_KEY);
}

export async function runEvaluations(options?: {
  includeLive?: boolean;
  only?: string;
}): Promise<EvalReport> {
  const startedAt = new Date().toISOString();
  const scenarios: EvalScenario[] = [];

  for (const load of SUITES) {
    const loaded = await load();
    scenarios.push(...loaded);
  }

  if (options?.includeLive) {
    const live = await import("./suites/live.suite");
    scenarios.push(...live.liveScenarios);
  }

  const filtered = options?.only
    ? scenarios.filter((s) => s.id.includes(options.only!))
    : scenarios;

  const results: EvalReport["results"] = [];
  const byCategory: EvalReport["byCategory"] = {};

  for (const scenario of filtered) {
    const bucket = (byCategory[scenario.category] ??= {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    });
    bucket.total += 1;

    let status: "passed" | "failed" | "skipped" = "passed";
    let result: EvalResult | null = null;
    let notes: string | undefined;

    try {
      if (scenario.kind === "integration" && !hasFirestoreCredentials()) {
        status = "skipped";
        notes = "Firestore credentials not available";
      } else if (scenario.kind === "live" && !hasLiveConfig()) {
        status = "skipped";
        notes = "EVAL_BASE_URL / EVAL_WIDGET_KEY not configured";
      } else {
        result = await scenario.run();
        status = result.passed ? "passed" : "failed";
        notes = result.notes;
      }
    } catch (error: unknown) {
      status = "failed";
      notes = error instanceof Error ? error.message.slice(0, 200) : "unknown error";
    }

    if (status === "passed") bucket.passed += 1;
    else if (status === "failed") bucket.failed += 1;
    else bucket.skipped += 1;

    results.push({
      id: scenario.id,
      category: scenario.category,
      description: scenario.description,
      weight: scenario.weight,
      kind: scenario.kind,
      status,
      checks: result?.checks ?? [],
      notes,
    });
  }

  const report: EvalReport = {
    startedAt,
    finishedAt: new Date().toISOString(),
    total: results.length,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    hardFailures: results
      .filter((r) => r.status === "failed" && r.weight === "hard")
      .map((r) => r.id),
    byCategory,
    results,
  };

  const outDir = path.join(process.cwd(), "evaluations");
  if (existsSync(outDir)) {
    writeFileSync(
      path.join(outDir, ".last-run.json"),
      JSON.stringify(report, null, 2),
      "utf8"
    );
  }

  return report;
}

export function formatReport(report: EvalReport): string {
  const lines: string[] = [];
  lines.push("CafeConnect AI evaluation");
  lines.push("=".repeat(60));
  lines.push(
    `total ${report.total} | passed ${report.passed} | failed ${report.failed} | skipped ${report.skipped}`
  );
  lines.push("");
  for (const [category, bucket] of Object.entries(report.byCategory)) {
    lines.push(
      `${category.padEnd(14)} total ${bucket.total} passed ${bucket.passed} failed ${bucket.failed} skipped ${bucket.skipped}`
    );
  }
  lines.push("");
  const failures = report.results.filter((r) => r.status === "failed");
  if (failures.length === 0) {
    lines.push("No failures.");
  } else {
    lines.push("Failures:");
    for (const failure of failures) {
      lines.push(`  [${failure.weight}] ${failure.id} - ${failure.description}`);
      for (const c of failure.checks.filter((c) => !c.passed)) {
        lines.push(`      - ${c.name}${c.detail ? `: ${c.detail}` : ""}`);
      }
      if (failure.notes) lines.push(`      notes: ${failure.notes}`);
    }
  }
  return lines.join("\n");
}

export function loadEnvFile(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, "");
    }
  }
}
