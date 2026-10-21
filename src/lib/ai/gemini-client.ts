import { GoogleGenerativeAI, type FunctionDeclaration } from "@google/generative-ai";
import { runTool, type ToolContext } from "./tools";

const clients = new Map<string, GoogleGenerativeAI>();

/**
 * Ordered model candidates. The first one is the tenant's configured model;
 * the rest are safety nets so a degraded/rate-limited model never blocks a
 * customer reply.
 */
export function modelCandidates(): string[] {
  const configured = process.env.GEMINI_MODEL?.trim();
  const list = [
    configured,
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.1-flash-lite",
  ].filter((value): value is string => Boolean(value));
  return Array.from(new Set(list));
}

const MODEL_TIMEOUT_MS = 8_000;
const MODEL_TIMEOUT_STREAM_MS = 25_000;

class ModelTimeoutError extends Error {
  constructor() {
    super("ModelTimeout");
    this.name = "ModelTimeout";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ModelTimeoutError()), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export class GeminiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiUnavailableError";
  }
}

export function getGeminiClient(apiKey: string): GoogleGenerativeAI {
  let client = clients.get(apiKey);
  if (!client) {
    client = new GoogleGenerativeAI(apiKey);
    clients.set(apiKey, client);
  }
  return client;
}

const MAX_RETRIES = 2;
const MAX_TOOL_ROUNDS = 3;

function isRetryable(message: string): boolean {
  return !/quota|API key|permission|not found|API_KEY_INVALID|400/i.test(message);
}

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
  const client = getGeminiClient(apiKey.trim());
  const generativeModel = client.getGenerativeModel({
    model: model.trim(),
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
  });

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = 400 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      const result = await generativeModel.generateContent(prompt);
      const text = result.response.text();
      if (!text.trim()) throw new Error("Empty AI response");
      return text;
    } catch (error: unknown) {
      lastError = error;
      const message = error instanceof Error ? error.message : "";
      console.error(
        `[ai-error] model=${model} attempt=${attempt + 1} message=${message.slice(0, 200)}`
      );
      if (!isRetryable(message)) {
        throw new GeminiUnavailableError("AIServiceUnavailable");
      }
    }
  }

  throw new GeminiUnavailableError(
    lastError instanceof Error ? lastError.message : "AIServiceUnavailable"
  );
}

/**
 * Generates a reply with bounded tool use (order booking / order status).
 * The model can only call the tools declared here; every tool validates its
 * own inputs, tenant scope and current state before touching data.
 */
export async function generateGeminiTextWithTools({
  apiKey,
  model = "gemini-3.5-flash-lite",
  prompt,
  tools,
  toolContext,
  temperature = 0.5,
  maxOutputTokens = 400,
}: {
  apiKey: string;
  model?: string;
  prompt: string;
  tools: FunctionDeclaration[];
  toolContext: ToolContext;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  const client = getGeminiClient(apiKey.trim());
  const candidates = modelCandidates().includes(model)
    ? modelCandidates()
    : [model, ...modelCandidates()];

  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const generativeModel = client.getGenerativeModel({
        model: candidate,
        generationConfig: {
          temperature,
          maxOutputTokens,
        },
        tools: [{ functionDeclarations: tools }],
      });

      const chat = generativeModel.startChat({
        tools: [{ functionDeclarations: tools }],
      });

      let response = await withTimeout(
        chat.sendMessage(prompt),
        MODEL_TIMEOUT_MS
      );

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const calls = response.response.functionCalls() ?? [];
        if (!calls.length) break;

        for (const call of calls) {
          const outcome = await runTool(call.name, call.args, toolContext);
          response = await withTimeout(
            chat.sendMessage([
              {
                functionResponse: {
                  name: call.name,
                  response: outcome.ok
                    ? { ok: true, ...(outcome.data ?? {}) }
                    : { ok: false, error: outcome.error ?? "Tool failed" },
                },
              },
            ]),
            MODEL_TIMEOUT_MS
          );
        }
      }

      const text = response.response.text();
      if (!text.trim()) {
        throw new GeminiUnavailableError("Empty AI response");
      }
      return text;
    } catch (error: unknown) {
      lastError = error;
      console.error(
        `[ai-error] scope=tool-call model=${candidate} message=${
          error instanceof Error ? error.message.slice(0, 160) : "unknown"
        }`
      );
    }
  }

  throw new GeminiUnavailableError(
    lastError instanceof Error ? lastError.message : "AIServiceUnavailable"
  );
}

/**
 * Streaming variant: emits text deltas as they arrive so the chat feels
 * instant. Tool calls are still executed through the same bounded registry.
 */
export async function generateGeminiTextWithToolsStream({
  apiKey,
  model = "gemini-3.5-flash-lite",
  prompt,
  tools,
  toolContext,
  temperature = 0.5,
  maxOutputTokens = 400,
  onDelta,
}: {
  apiKey: string;
  model?: string;
  prompt: string;
  tools: FunctionDeclaration[];
  toolContext: ToolContext;
  temperature?: number;
  maxOutputTokens?: number;
  onDelta: (chunk: string) => void;
}): Promise<string> {
  const client = getGeminiClient(apiKey.trim());
  const candidates = modelCandidates().includes(model)
    ? modelCandidates()
    : [model, ...modelCandidates()];

  let lastError: unknown;

  for (const candidate of candidates) {
    const full = "";
    let buffer = "";
    try {
      const generativeModel = client.getGenerativeModel({
        model: candidate,
        generationConfig: {
          temperature,
          maxOutputTokens,
        },
        tools: [{ functionDeclarations: tools }],
      });

      const chat = generativeModel.startChat({
        tools: [{ functionDeclarations: tools }],
      });

      const streamResult = await withTimeout(
        chat.sendMessageStream(prompt),
        MODEL_TIMEOUT_STREAM_MS
      );

      for await (const chunk of streamResult.stream) {
        const piece = chunk.text();
        if (piece) {
          buffer += piece;
          onDelta(piece);
        }
      }

      const aggregated = await streamResult.response;
      let calls = (aggregated.functionCalls() ?? []) as Array<{
        name: string;
        args: object;
      }>;

      for (let round = 0; round < MAX_TOOL_ROUNDS && calls.length; round++) {
        for (const call of calls) {
          const outcome = await runTool(call.name, call.args, toolContext);
          const next = await withTimeout(
            chat.sendMessageStream([
              {
                functionResponse: {
                  name: call.name,
                  response: outcome.ok
                    ? { ok: true, ...(outcome.data ?? {}) }
                    : { ok: false, error: outcome.error ?? "Tool failed" },
                },
              },
            ] as never),
            MODEL_TIMEOUT_STREAM_MS
          );

          for await (const chunk of next.stream) {
            const piece = chunk.text();
            if (piece) {
              buffer += piece;
              onDelta(piece);
            }
          }
          const nextAgg = await next.response;
          calls = (nextAgg.functionCalls() ?? []) as Array<{
            name: string;
            args: object;
          }>;
        }
      }

      const text = buffer.trim();
      if (!text) {
        throw new GeminiUnavailableError("Empty AI response");
      }
      return text;
    } catch (error: unknown) {
      lastError = error;
      console.error(
        `[ai-error] scope=tool-call-stream model=${candidate} message=${
          error instanceof Error ? error.message.slice(0, 160) : "unknown"
        }`
      );
    }
  }

  throw new GeminiUnavailableError(
    lastError instanceof Error ? lastError.message : "AIServiceUnavailable"
  );
}

