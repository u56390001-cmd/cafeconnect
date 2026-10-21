# CafeConnect AI evaluation suite

Implementation of blueprint §15 ("Evaluation and continuous improvement").

## What this is

A scenario-based evaluation harness that runs the AI stack's **hard** invariants
automatically, so a change to the prompt, tools, pricing or memory can never
silently break money, order state, tenant scope or language handling.

- **Hard scenarios** must pass. They fail the build.
- **Soft scenarios** (live model phrasing) are reported but never block a
  release, because naturalness varies between model versions.

## Running it

```bash
npm run eval          # deterministic + integration scenarios (uses .env.local)
npm run eval:live     # additionally runs the live-model scenarios
```

`npm run ci` runs lint → typecheck → unit tests → **eval** → build.

Live-model scenarios need two variables:

```
EVAL_BASE_URL=https://cafeconnect-rho.vercel.app
EVAL_WIDGET_KEY=<public widget id of your tenant>
```

## Layout

```
evaluations/
  types.ts             scenario + result types, assertion helpers
  runner.ts            loads suites, runs scenarios, writes the report
  eval.test.ts         vitest entry (fails on any hard failure)
  suites/core.suite.ts      pure scenarios (no network)
  suites/integration.suite.ts  Firestore-backed scenarios
  suites/live.suite.ts     live model scenarios (soft)
  .last-run.json       last report (git ignored)
```

## What is covered

| Category | Examples |
|---|---|
| `pricing` | subtotal/total math, whole-order vs category-scoped offers, free-delivery waives only the fee, expired offers ignored, never negative, integer minor units |
| `policy` | delivery-area verification, unconfigured rules never claim eligibility |
| `order_state` | typed error codes, stable cart ids, idempotency key per cart revision, quote/submit flow, indexed order lookup, minimum order enforcement |
| `tenancy` | tenant-scoped customer ids, no raw PII in document keys, no silent cross-channel linking, phone normalisation |
| `memory` | consent gating, correction supersedes the old fact, only allow-listed facts are stored, the model is told not to mention memory |
| `language` | Urdu script, Roman Urdu, Hinglish, English detection, script mirroring in the prompt, localised fallbacks |
| `safety` | customer text is data not instructions, no invented prices, no false confirmation, handoff rules, prompt versioning, availability in the menu, aliases exposed |
| `tool_contract` | registry version, all tools registered, complete schemas, quote-before-confirm, optional single upsell, booking never "confirmed" |
| `recovery` | cart corrections merge, a change invalidates the quote, a submitted cart cannot be resubmitted, booking/reminder type validation, consent required for reminders, safe default messaging policy |

## Adding a scenario

```ts
{
  id: "pricing-011-my-rule",
  category: "pricing",
  description: "What must stay true",
  weight: "hard",          // "hard" blocks the build
  kind: "pure",            // pure | integration | live
  run: () => ok([check("rule", actual === expected)]),
}
```

Guidance:

- Prefer **pure** scenarios (no network) so CI stays fast and deterministic.
- Use `integration` only when the behaviour needs Firestore.
- Never assert on model phrasing in a hard scenario; that is what `soft` + the
  live suite is for.
- Business rules belong in the domain services (`src/lib/services/*`), and the
  scenarios assert those services - not the prompt text.

## Known gaps

- The live suite only covers the website widget; WhatsApp behaviour is covered
  by the unit tests plus manual checks.
- There is no automated check for the tenant-configured Gemini key quality
  (quota/health is observed through the model fallback chain instead).
