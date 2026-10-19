import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

export function getGeminiClient(apiKey: string): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

export async function generateGeminiText({
  apiKey,
  model = "gemini-1.5-flash",
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
