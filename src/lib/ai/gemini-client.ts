import { GoogleGenerativeAI } from "@google/generative-ai";

const clients = new Map<string, GoogleGenerativeAI>();

export function getGeminiClient(apiKey: string): GoogleGenerativeAI {
  let client = clients.get(apiKey);
  if (!client) {
    client = new GoogleGenerativeAI(apiKey);
    clients.set(apiKey, client);
  }
  return client;
}

export async function generateGeminiText({
  apiKey,
  model = "gemini-2.5-flash",
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
  const client = getGeminiClient(apiKey);
  const generativeModel = client.getGenerativeModel({
    model,
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
  });

  const result = await generativeModel.generateContent(prompt);
  const response = result.response;
  return response.text();
}
