import { adminDb } from "@/lib/firebase/admin";
import { getGeminiClient } from "@/lib/ai/gemini-client";
import { requireTenantScope, tenantRef } from "@/lib/tenancy/resolver";
import { createApiError, createApiResponse } from "@/lib/api/response";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();
    const { tenantId, userId, role, message, conversationId } = body;

    if (!tenantId || !userId || !message) {
      return createApiError("Missing required fields", 400);
    }

    const ctx = await requireTenantScope(tenantId, userId, role || "readOnly");

    // Fetch tenant's active Gemini API key (server-side only)
    const apiKeysRef = tenantRef(ctx.tenantId, "apiKeys");
    const geminiKeySnap = await apiKeysRef
      .where("provider", "==", "gemini")
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (geminiKeySnap.empty) {
      return createApiError("Gemini API key not configured", 403);
    }

    const keyDoc = geminiKeySnap.docs[0];
    const keyData = keyDoc.data();

    // Note: Decryption requires SECRET_ENCRYPTION_KEY from env
    // For now, validate key exists; full decrypt flow wired in settings step

    const genAI = getGeminiClient(keyData.maskedHint || "");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(message);
    const text = result.response.text();

    // Persist message (server-side, tenant-scoped)
    const msgRef = tenantRef(
      ctx.tenantId,
      `conversations/${conversationId}/messages`
    ).doc();
    await msgRef.set({
      messageId: msgRef.id,
      tenantId: ctx.tenantId,
      conversationId,
      direction: "outbound",
      senderType: "assistant",
      content: text,
      processingStatus: "processed",
      createdAt: new Date(),
    });

    return createApiResponse({ text, messageId: msgRef.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return createApiError(message, 500);
  }
}
