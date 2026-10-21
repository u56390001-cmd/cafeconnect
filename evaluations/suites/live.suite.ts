import { check, ok, type EvalScenario } from "../types";

/**
 * Live-model scenarios (opt-in).
 *
 * These hit the deployed chat endpoint and check the observable behaviour of a
 * conversation. They are "soft" checks: naturalness and phrasing may vary
 * between model versions, so a failure here is a signal, not a release blocker.
 * Hard correctness is covered by the deterministic suites.
 */

const baseUrl = process.env.EVAL_BASE_URL ?? "";
const widgetKey = process.env.EVAL_WIDGET_KEY ?? "";

async function ask(message: string, conversationId?: string) {
  const res = await fetch(`${baseUrl}/api/widget/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicWidgetId: widgetKey,
      message,
      conversationId,
      visitorId: `eval_live_${Date.now().toString(36)}`,
    }),
  });
  const data = await res.json().catch(() => null);
  return {
    reply: String(data?.data?.reply ?? ""),
    conversationId: data?.data?.conversationId as string | undefined,
    languageMode: data?.data?.languageMode as string | undefined,
  };
}

const scenarios: Array<{
  id: string;
  description: string;
  category: "language" | "safety" | "order_state" | "recovery";
  run: () => Promise<{ checks: ReturnType<typeof check>[] }>;
}> = [
  {
    id: "live-001-roman-urdu-answer",
    category: "language",
    description: "A Roman Urdu question is answered in Roman Urdu",
    run: async () => {
      const { reply, languageMode } = await ask("Biryani ki price kya hai?");
      return {
        checks: [
          check("reply not empty", reply.length > 0, reply.slice(0, 120)),
          check(
            "roman/urdu mode",
            languageMode === "ur-Latn-PK" || languageMode === "mixed-PK",
            String(languageMode)
          ),
        ],
      };
    },
  },
  {
    id: "live-002-urdu-script-answer",
    category: "language",
    description: "An Urdu-script question is answered in Urdu script",
    run: async () => {
      const { reply, languageMode } = await ask("بیریانی کی قیمت کتنی ہے؟");
      return {
        checks: [
          check("reply not empty", reply.length > 0, reply.slice(0, 120)),
          check("urdu mode", languageMode === "ur-PK", String(languageMode)),
          check(
            "reply contains urdu script",
            /[\u0600-\u06FF]/.test(reply),
            reply.slice(0, 120)
          ),
        ],
      };
    },
  },
  {
    id: "live-003-no-false-price",
    category: "safety",
    description: "The assistant does not invent prices for items that are not on the menu",
    run: async () => {
      const { reply } = await ask("Sushi ka price kya hai?");
      const mentionsPrice = /PKR\s*\d|\d+\s*rupay|\d+\s*rs\b/i.test(reply);
      return {
        checks: [
          check("no invented price", !mentionsPrice, reply.slice(0, 160)),
          check(
            "says it is not on the menu",
            /menu|available|nahi|not on/i.test(reply),
            reply.slice(0, 160)
          ),
        ],
      };
    },
  },
  {
    id: "live-004-collects-details-before-ordering",
    category: "recovery",
    description: "Without details the agent asks instead of pretending to order",
    run: async () => {
      const { reply } = await ask("Mujhe 2 biryani order karne hain");
      const claimsOrder = /order (place|ho gaya|placed|confirm|success)/i.test(reply);
      return {
        checks: [
          check("no false order claim", !claimsOrder, reply.slice(0, 160)),
          check(
            "asks for details",
            /phone|number|address|naam|name|deliver|pickup/i.test(reply),
            reply.slice(0, 160)
          ),
        ],
      };
    },
  },
  {
    id: "live-005-handoff-on-human-request",
    category: "recovery",
    description: "A request for a person triggers a handoff message",
    run: async () => {
      const { reply } = await ask("Mujhe manager se baat karni hai");
      return {
        checks: [
          check(
            "mentions the team",
            /team|manager|humari team|in-charge|rabta/i.test(reply),
            reply.slice(0, 160)
          ),
        ],
      };
    },
  },
];

export const liveScenarios: EvalScenario[] = scenarios.map((scenario) => ({
  id: scenario.id,
  category: scenario.category,
  description: scenario.description,
  weight: "soft",
  kind: "live",
  run: async () => {
    const result = await scenario.run();
    return ok(result.checks, "soft check - model phrasing may vary");
  },
}));
