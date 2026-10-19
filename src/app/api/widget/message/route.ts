import { adminDb } from "@/lib/firebase/admin";
import { getGeminiClient } from "@/lib/ai/gemini-client";
import { requireTenantScope, tenantDoc } from "@/lib/tenancy/resolver";
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

    const keySnap = await adminDb
      .collection(`tenants/${ctx.tenantId}/apiKeys`)
      .where("provider", "==", "gemini")
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (keySnap.empty) {
      return createApiError("Gemini API key not configured", 403);
    }

    const keyData = keySnap.docs[0].data();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return createApiError("Gemini API key not configured on server", 403);
    }

    const genAI = getGeminiClient(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(message);
    const text = result.response.text();

    const msgRef = tenantDoc(
      ctx.tenantId,
      `conversations/${conversationId}/messages`,
      "msg-" + Date.now().toString(36)
    );
    await msgRef.set({
      messageId: msgRef.id,
      tenantId: ctx.tenantId,
      conversationId,
      direction: "outbound",
      senderType: "assistant",
      content: text,
      processingStatus: "processed",
      deliveryStatus: "sent",
      sourceReferences: [],
      toolActionReferences: [],
      createdAt: new Date(),
    });

    return createApiResponse({ text, messageId: msgRef.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return createApiError(message, 500);
  }
}
