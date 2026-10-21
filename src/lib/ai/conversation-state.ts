import { tenantDoc } from "@/lib/tenancy/resolver";
import type { LanguageMode } from "./language";

/**
 * Conversation state (Phase 1 of the blueprint).
 *
 * The assistant must not rely on raw chat text as the only record of an
 * active order. This module derives a small, structured state from the
 * conversation so it can be injected into the prompt and persisted on the
 * conversation document.
 *
 * The derivation is deterministic (no extra model call) so it costs nothing
 * in latency.
 */

export type ActiveIntent =
  | "menu_question"
  | "order_request"
  | "order_status"
  | "human_request"
  | "complaint"
  | "general";

export interface ConversationState {
  activeIntent: ActiveIntent;
  /** Order details that are still missing before an order can be placed. */
  missingOrderDetails: string[];
  /** Items the customer has mentioned so far (best effort, from chat text). */
  mentionedItems: string[];
  cartRevision: number;
  /** Last authoritative quote/order reference produced by a tool. */
  lastVerifiedQuote: string | null;
  lastOrderNumber: string | null;
  handoffStatus: string;
  /** Compact summary of the conversation so far. */
  compactSummary: string;
  stateVersion: number;
}

const ORDER_DETAIL_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "name", pattern: /\b(naam|name|my name is|mera naam|یہ ہے)\b/i },
  { key: "phone", pattern: /(\+?\d[\d\s-]{7,})/ },
  {
    key: "address",
    pattern:
      /\b(address|house|street|flat|apartment|phase|sector|society|road|gali|mohalla|گھر|ایڈریس)\b/i,
  },
  {
    key: "fulfilment",
    pattern: /\b(delivery|deliver|pickup|takeaway|home|دلیوری|پک اپ)\b/i,
  },
];

const HUMAN_REQUEST_PATTERNS =
  /\b(human|agent|person|manager|owner|staff|koi insaan|insaan se|baat karni|complaint|complain|shikayat|galat order|refund)\b/i;

const STATUS_PATTERNS =
  /\b(order status|order ki status|my order|meray order|order kahan|order kitne|status)\b/i;

const ORDER_PATTERNS =
  /\b(order|place|mangwa|mangwaya|book|bhejo|bhej do|chaahein|chahye|add karo|dal do)\b/i;

const MENU_PATTERNS =
  /\b(menu|kya hai|available|price|prices|list|kya kya|items|kis|kis item)\b/i;

export function deriveActiveIntent(message: string): ActiveIntent {
  const text = message ?? "";
  if (HUMAN_REQUEST_PATTERNS.test(text)) return "human_request";
  if (STATUS_PATTERNS.test(text)) return "order_status";
  if (ORDER_PATTERNS.test(text)) return "order_request";
  if (MENU_PATTERNS.test(text)) return "menu_question";
  return "general";
}

export function deriveMissingOrderDetails(
  message: string,
  history: string[]
): string[] {
  const haystack = `${history.slice(-6).join(" \n ")} ${message}`;
  const missing: string[] = [];
  for (const { key, pattern } of ORDER_DETAIL_PATTERNS) {
    if (!pattern.test(haystack)) missing.push(key);
  }
  return missing;
}

export function deriveCompactSummary(
  history: Array<{ role: string; content: string }>,
  maxChars = 400
): string {
  if (history.length === 0) return "";
  const lines: string[] = [];
  for (const turn of history.slice(-6)) {
    const who = turn.role === "user" ? "Customer" : "Assistant";
    const text = turn.content.replace(/\s+/g, " ").trim();
    if (text) lines.push(`${who}: ${text}`);
  }
  const summary = lines.join(" | ");
  return summary.length > maxChars ? `${summary.slice(0, maxChars - 1)}…` : summary;
}

export interface PersistedState {
  activeIntent?: ActiveIntent;
  missingOrderDetails?: string[];
  cartRevision?: number;
  lastVerifiedQuote?: string | null;
  lastOrderNumber?: string | null;
  compactSummary?: string;
  stateVersion?: number;
  lastPromptVersion?: string;
  lastMemoryUpdatedAt?: string;
  aiEnabled?: boolean;
  status?: string;
}

export function buildStateBlock(state: ConversationState): string {
  const lines: string[] = [];
  lines.push(`Active intent: ${state.activeIntent.replace(/_/g, " ")}`);
  if (state.activeIntent === "order_request") {
    lines.push(
      state.missingOrderDetails.length > 0
        ? `Still needed before booking: ${state.missingOrderDetails.join(", ")}`
        : "All order details appear to be collected."
    );
    if (state.mentionedItems.length > 0) {
      lines.push(`Items the customer mentioned: ${state.mentionedItems.join(", ")}`);
    }
    if (state.lastOrderNumber) {
      lines.push(`Last confirmed order number: ${state.lastOrderNumber}`);
    }
  }
  if (state.lastVerifiedQuote) {
    lines.push(`Last verified quote: ${state.lastVerifiedQuote}`);
  }
  lines.push(`Conversation status: ${state.handoffStatus}`);
  if (state.compactSummary) {
    lines.push(`Summary so far: ${state.compactSummary}`);
  }
  return lines.join("\n");
}

/** Reads the persisted state from a conversation document. */
export async function readPersistedState(
  tenantId: string,
  conversationId: string
): Promise<PersistedState> {
  const snap = await tenantDoc(tenantId, "conversations", conversationId).get();
  return (snap.data() ?? {}) as PersistedState;
}

/** Persists the derived state so the next turn can build on it. */
export async function persistState(
  tenantId: string,
  conversationId: string,
  state: ConversationState,
  promptVersion: string
): Promise<void> {
  await tenantDoc(tenantId, "conversations", conversationId).set(
    {
      activeIntent: state.activeIntent,
      missingOrderDetails: state.missingOrderDetails,
      cartRevision: state.cartRevision,
      lastVerifiedQuote: state.lastVerifiedQuote,
      lastOrderNumber: state.lastOrderNumber,
      compactSummary: state.compactSummary,
      stateVersion: state.stateVersion,
      lastPromptVersion: promptVersion,
      lastMemoryUpdatedAt: new Date().toISOString(),
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

/** Language hint used when the state layer is rendered. */
export function stateLanguageHint(mode: LanguageMode): string {
  return mode;
}
