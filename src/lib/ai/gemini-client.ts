import { runTool, type ToolContext } from "./tools";

/**
 * Gemini client built on the REST API (v1beta).
 *
 * Why REST and not the SDK: the current Gemini API rejects the legacy
 * "function" role that the SDK sends for tool results, and it requires the
 * thought signature to be echoed back with the function call. Using REST gives
 * us exact control over the payload and over streaming.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface RestPart {
  text?: string;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
    id?: string;
  };
  thoughtSignature?: string;
}

export interface RestContent {
  role: "user" | "model";
  parts: RestPart[];
}

export class GeminiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiUnavailableError";
  }
}

/**
 * Per-model health. Free-tier quotas are granted per model, so one model can
 * be rate-limited (429) or degraded (hang) while another still works. A model
 * that times out or is rate-limited is paused for a while so later requests
 * do not pay the timeout again.
 */
const MODEL_COOLDOWN_MS = 10 * 60 * 1000;
const unhealthyUntil = new Map<string, number>();

function markModelUnhealthy(model: string): void {
  unhealthyUntil.set(model, Date.now() + MODEL_COOLDOWN_MS);
  void publishModelUnhealthy(model);
}

function isModelHealthy(model: string): boolean {
  const until = unhealthyUntil.get(model);
  if (!until) return true;
  if (until <= Date.now()) {
    unhealthyUntil.delete(model);
    return true;
  }
  return false;
}

/**
 * Model health is shared across serverless instances through a single
 * Firestore document, so a degraded model is skipped everywhere instead of
 * costing a timeout on every cold start.
 */
const HEALTH_DOC_PATH = "aiRuntime/modelHealth";
const SHARED_HEALTH_TTL_MS = 60_000;
let sharedHealthLoadedAt = 0;

async function loadSharedHealth(): Promise<void> {
  if (Date.now() - sharedHealthLoadedAt < SHARED_HEALTH_TTL_MS) return;
  sharedHealthLoadedAt = Date.now();
  try {
    const { getAdminDb } = await import("@/lib/firebase/admin");
    const snap = await getAdminDb().collection(HEALTH_DOC_PATH).doc("default").get();
    if (!snap.exists) return;
    const data = snap.data() ?? {};
    const paused = (data.paused as Record<string, number>) ?? {};
    for (const [model, until] of Object.entries(paused)) {
      if (typeof until === "number" && until > Date.now()) {
        unhealthyUntil.set(model, until);
      }
    }
  } catch {
    // Health sharing is best-effort; never block a reply for it.
  }
}

async function publishModelUnhealthy(model: string): Promise<void> {
  try {
    const { getAdminDb } = await import("@/lib/firebase/admin");
    await getAdminDb()
      .collection(HEALTH_DOC_PATH)
      .doc("default")
      .set(
        { paused: { [model]: Date.now() + MODEL_COOLDOWN_MS } },
        { merge: true }
      );
  } catch {
    // best effort
  }
}

export async function healthyModelCandidates(): Promise<string[]> {
  await loadSharedHealth();
  return modelCandidates();
}

export function modelCandidates(): string[] {
  const configured = process.env.GEMINI_MODEL?.trim();
  const list = [
    configured,
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
  ].filter((value): value is string => Boolean(value));
  const unique = Array.from(new Set(list));
  const healthy = unique.filter((model) => isModelHealthy(model));
  // Never return an empty list: fall back to every candidate.
  return healthy.length > 0 ? healthy : unique;
}

const MODEL_TIMEOUT_MS = 7_000;
const STREAM_TIMEOUT_MS = 18_000;
/** Total budget for one AI turn across all model candidates. */
const REQUEST_DEADLINE_MS = 12_000;

function remainingBudget(deadline?: number): number {
  if (!deadline) return MODEL_TIMEOUT_MS;
  return Math.max(0, deadline - Date.now());
}

class ModelTimeoutError extends Error {
  constructor() {
    super("ModelTimeout");
    this.name = "ModelTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ModelTimeoutError()), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

function toolPayload(
  tools: Array<{ name: string; description: string; parameters: unknown }>
): unknown[] {
  return tools.map((fn) => ({
    functionDeclarations: [
      {
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters,
      },
    ],
  }));
}

function shouldPauseModel(message: string): boolean {
  return /429|quota|overloaded|high demand|503|timeout|aborted/i.test(message);
}

async function restCall(
  apiKey: string,
  model: string,
  body: Record<string, unknown>
): Promise<RestPart[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/${model}:generateContent?key=${apiKey.trim()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: RestPart[] } }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(
        data.error?.message ?? `Gemini request failed (${res.status})`
      );
    }
    return data.candidates?.[0]?.content?.parts ?? [];
  } finally {
    clearTimeout(timer);
  }
}

async function restStream(
  apiKey: string,
  model: string,
  body: Record<string, unknown>,
  onDelta: (chunk: string) => void
): Promise<RestPart[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
  const collected: RestPart[] = [];

  try {
    const res = await fetch(
      `${API_BASE}/${model}:streamGenerateContent?alt=sse&key=${apiKey.trim()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );

    if (!res.ok || !res.body) {
      throw new Error(`Gemini stream failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // The Gemini SSE endpoint separates events with \r\n\r\n.
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        for (const line of chunk.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let parsed: {
            candidates?: Array<{ content?: { parts?: RestPart[] } }>;
          };
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }
          const parts = parsed.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            collected.push(part);
            if (part.text) onDelta(part.text);
          }
        }
      }
    }

    // Flush a trailing event that arrived without a separator.
    if (buffer.trim()) {
      for (const line of buffer.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        try {
          const parsed = JSON.parse(trimmed.slice(5).trim()) as {
            candidates?: Array<{ content?: { parts?: RestPart[] } }>;
          };
          const parts = parsed.candidates?.[0]?.content?.parts ?? [];
          for (const part of parts) {
            collected.push(part);
            if (part.text) onDelta(part.text);
          }
        } catch {
          // ignore malformed tail
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }

  return collected;
}

function textFromParts(parts: RestPart[]): string {
  return parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

/**
 * Generates a reply with bounded tool use (order booking / order status).
 * Every tool validates its own inputs, tenant scope and current state.
 */
export async function generateGeminiTextWithTools({
  apiKey,
  model,
  prompt,
  tools,
  toolContext,
  temperature = 0.5,
  maxOutputTokens = 400,
  onToolOutcome,
  deadline,
}: {
  apiKey: string;
  model?: string;
  prompt: string;
  tools: Array<{
    name: string;
    description: string;
    parameters: unknown;
  }>;
  toolContext: ToolContext;
  temperature?: number;
  maxOutputTokens?: number;
  onToolOutcome?: (name: string, outcome: { ok: boolean; data?: Record<string, unknown>; error?: string }) => void;
  deadline?: number;
}): Promise<string> {
  const hardDeadline = deadline ?? Date.now() + REQUEST_DEADLINE_MS;
  const available = await healthyModelCandidates();
  const candidates = available.includes(model ?? "")
    ? available
    : [model ?? "gemini-3.5-flash-lite", ...available];

  const toolSpec = toolPayload(tools);
  let lastError: unknown;

  for (const candidate of candidates) {
    const budget = remainingBudget(hardDeadline);
    if (budget <= 0) break;

    const contents: RestContent[] = [
      { role: "user", parts: [{ text: prompt }] },
    ];

    try {
      for (let round = 0; round < 3; round++) {
        const roundBudget = remainingBudget(hardDeadline);
        if (roundBudget <= 0) throw new Error("RequestDeadlineExceeded");
        const parts = await withTimeout(
          restCall(apiKey, candidate, {
            contents,
            tools: toolSpec,
            generationConfig: { temperature, maxOutputTokens },
          }),
          Math.min(MODEL_TIMEOUT_MS, roundBudget)
        );

        const callPart = parts.find((part) => part.functionCall);
        if (!callPart) {
          const text = textFromParts(parts);
          if (!text) throw new Error("Empty AI response");
          return text;
        }

        // Echo the model turn back verbatim (it carries the thought signature
        // that the API requires for tool results).
        contents.push({ role: "model", parts: [callPart] });

        const outcome = await runTool(
          callPart.functionCall!.name,
          callPart.functionCall!.args,
          toolContext
        );
        onToolOutcome?.(callPart.functionCall!.name, outcome);

        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: callPart.functionCall!.name,
                response: outcome.ok
                  ? { ok: true, ...(outcome.data ?? {}) }
                  : { ok: false, error: outcome.error ?? "Tool failed" },
              },
            } as unknown as RestPart,
          ],
        });
      }

      throw new Error("Tool loop did not converge");
    } catch (error: unknown) {
      lastError = error;
      const message = error instanceof Error ? error.message : "unknown";
      console.error(
        `[ai-error] scope=tool-call model=${candidate} message=${message.slice(0, 180)}`
      );
      if (shouldPauseModel(message)) markModelUnhealthy(candidate);
    }
  }

  throw new GeminiUnavailableError(
    lastError instanceof Error ? lastError.message : "AIServiceUnavailable"
  );
}

/**
 * Streaming variant used by the website chat: the browser receives text
 * deltas while the model is still writing, so the reply feels immediate.
 */
export async function generateGeminiTextWithToolsStream({
  apiKey,
  model,
  prompt,
  tools,
  toolContext,
  temperature = 0.5,
  maxOutputTokens = 400,
  onDelta,
  onToolOutcome,
  deadline,
}: {
  apiKey: string;
  model?: string;
  prompt: string;
  tools: Array<{
    name: string;
    description: string;
    parameters: unknown;
  }>;
  toolContext: ToolContext;
  temperature?: number;
  maxOutputTokens?: number;
  onDelta: (chunk: string) => void;
  onToolOutcome?: (name: string, outcome: { ok: boolean; data?: Record<string, unknown>; error?: string }) => void;
  deadline?: number;
}): Promise<string> {
  const hardDeadline = deadline ?? Date.now() + REQUEST_DEADLINE_MS;
  const available = await healthyModelCandidates();
  const candidates = available.includes(model ?? "")
    ? available
    : [model ?? "gemini-3.5-flash-lite", ...available];

  const toolSpec = toolPayload(tools);
  let lastError: unknown;

  for (const candidate of candidates) {
    if (remainingBudget(hardDeadline) <= 0) break;
    const contents: RestContent[] = [
      { role: "user", parts: [{ text: prompt }] },
    ];
    let text = "";

    try {
      for (let round = 0; round < 3; round++) {
        const roundBudget = remainingBudget(hardDeadline);
        if (roundBudget <= 0) throw new Error("RequestDeadlineExceeded");
        const parts = await withTimeout(
          restStream(
            apiKey,
            candidate,
            {
              contents,
              tools: toolSpec,
              generationConfig: { temperature, maxOutputTokens },
            },
            onDelta
          ),
          Math.min(STREAM_TIMEOUT_MS, roundBudget)
        );

        const callPart = parts.find((part) => part.functionCall);
        if (!callPart) {
          if (!text.trim()) throw new Error("Empty AI response");
          return text.trim();
        }
        contents.push({ role: "model", parts: [callPart] });

        const outcome = await runTool(
          callPart.functionCall!.name,
          callPart.functionCall!.args,
          toolContext
        );
        onToolOutcome?.(callPart.functionCall!.name, outcome);

        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: callPart.functionCall!.name,
                response: outcome.ok
                  ? { ok: true, ...(outcome.data ?? {}) }
                  : { ok: false, error: outcome.error ?? "Tool failed" },
              },
            } as unknown as RestPart,
          ],
        });
      }

      throw new Error("Tool loop did not converge");
    } catch (error: unknown) {
      lastError = error;
      const message = error instanceof Error ? error.message : "unknown";
      console.error(
        `[ai-error] scope=tool-call-stream model=${candidate} message=${message.slice(0, 180)}`
      );
      // If text was already streamed, do not retry with another model: the
      // customer would receive the same answer twice.
      if (text.trim()) return text.trim();
      if (shouldPauseModel(message)) markModelUnhealthy(candidate);
    }
  }

  throw new GeminiUnavailableError(
    lastError instanceof Error ? lastError.message : "AIServiceUnavailable"
  );
}

/** Simple text generation without tools (used for short internal prompts). */
export async function generateGeminiText({
  apiKey,
  model = "gemini-3.5-flash-lite",
  prompt,
  temperature = 0.7,
  maxOutputTokens = 400,
}: {
  apiKey: string;
  model?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  const available = await healthyModelCandidates();
  const candidates = available.includes(model)
    ? available
    : [model, ...available];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const parts = await withTimeout(
        restCall(apiKey, candidate, {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens },
        }),
        MODEL_TIMEOUT_MS
      );
      const text = textFromParts(parts);
      if (!text) throw new Error("Empty AI response");
      return text;
    } catch (error: unknown) {
      lastError = error;
      const message = error instanceof Error ? error.message : "unknown";
      console.error(
        `[ai-error] scope=text model=${candidate} message=${message.slice(0, 180)}`
      );
      if (shouldPauseModel(message)) markModelUnhealthy(candidate);
    }
  }

  throw new GeminiUnavailableError(
    lastError instanceof Error ? lastError.message : "AIServiceUnavailable"
  );
}


