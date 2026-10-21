/**
 * AI evaluation harness (blueprint §15).
 *
 * Scenarios assert the things that must never be wrong:
 * money, order state, tool outcomes, tenant scope, memory consent and
 * language handling. Subjective qualities (naturalness) are reported as soft
 * checks and never gate a release on their own.
 */

export type EvalCategory =
  | "pricing"
  | "order_state"
  | "tool_contract"
  | "tenancy"
  | "memory"
  | "language"
  | "safety"
  | "recovery"
  | "policy";

export type EvalWeight = "hard" | "soft";

export interface EvalCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface EvalResult {
  passed: boolean;
  checks: EvalCheck[];
  notes?: string;
}

export interface EvalScenario {
  id: string;
  category: EvalCategory;
  description: string;
  /** "hard" scenarios must pass; "soft" are reported only. */
  weight: EvalWeight;
  /** "pure" runs without network, "integration" needs Firestore, "live" needs a deployed app. */
  kind: "pure" | "integration" | "live";
  run: () => Promise<EvalResult> | EvalResult;
}

export interface EvalReport {
  startedAt: string;
  finishedAt: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  hardFailures: string[];
  byCategory: Record<string, { total: number; passed: number; failed: number; skipped: number }>;
  results: Array<{
    id: string;
    category: EvalCategory;
    description: string;
    weight: EvalWeight;
    kind: string;
    status: "passed" | "failed" | "skipped";
    checks: EvalCheck[];
    notes?: string;
  }>;
}

export function check(name: string, passed: boolean, detail?: string): EvalCheck {
  return { name, passed, detail };
}

export function ok(checks: EvalCheck[], notes?: string): EvalResult {
  return {
    passed: checks.every((c) => c.passed),
    checks,
    notes,
  };
}

export function fail(name: string, detail?: string): EvalCheck {
  return { name, passed: false, detail };
}
