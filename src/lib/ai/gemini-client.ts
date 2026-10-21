import { GoogleGenerativeAI } from "@google/generative-ai";

const clients = new Map<string, GoogleGenerativeAI>();

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

export async function generateGeminiText({
  apiKey,
  model = "gemini-3.1-flash-lite",
  prompt,
  temperature = 0.7,
  maxOutputTokens = 1024,
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
      const delayMs = 600 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300);
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
      if (/quota|API key|permission|not found|API_KEY_INVALID|400/i.test(message)) {
        throw new GeminiUnavailableError("AIServiceUnavailable");
      }
      // 503 / "overloaded" / network → retry
    }
  }

  throw new GeminiUnavailableError("AIServiceUnavailable");
}
