import { NextResponse } from "next/server";
import { tenantDoc } from "@/lib/tenancy/resolver";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const t0 = Date.now();
  const db = getAdminDb();
  const t1 = Date.now();
  await db.collection("widgetConfigs").limit(1).get();
  const t2 = Date.now();
  const snap = await tenantDoc("00wnUFnHmaFu7I3fASMh", "profile", "main").get();
  const t3 = Date.now();

  const key = process.env.GEMINI_API_KEY?.trim();
  let geminiMs = -1;
  if (key) {
    const g0 = Date.now();
    try {
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "ping" }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
        }
      );
      geminiMs = Date.now() - g0;
    } catch {
      geminiMs = -2;
    }
  }

  return NextResponse.json({
    region: process.env.VERCEL_REGION ?? "unknown",
    firebaseInitMs: t1 - t0,
    firestoreQueryMs: t2 - t1,
    firestoreDocMs: t3 - t2,
    geminiMs,
    totalMs: Date.now() - t0,
  });
}
