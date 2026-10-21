import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const key = process.env.GEMINI_API_KEY ?? "";
  const model = process.env.GEMINI_MODEL ?? "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return NextResponse.json({
    keyLength: key.length,
    keyLastCharCode: key.length ? key.charCodeAt(key.length - 1) : -1,
    keyPrefix: key.slice(0, 6),
    model,
    modelLength: model.length,
    appUrl,
    appUrlLength: appUrl.length,
  });
}
