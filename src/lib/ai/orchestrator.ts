import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";
import { getTenantApiKey } from "@/lib/settings/keys";
import { loadTenantAiContext, type TenantAiContext } from "./context-builder";
import { buildGroundedPrompt, type PromptMessage } from "./prompt-builder";
import { generateGeminiText } from "./gemini-client";

export type ChatChannel = "web" | "whatsapp_meta" | "whatsapp_qr";

export interface OutboundReply {
  reply: string;
  conversationId: string;
  customerName: string | null;
}

export async function ensureConversation(
  tenantId: string,
  conversationId: string | undefined,
  channel: ChatChannel,
  customerReference: string
): Promise<string> {
  const db = tenantCollection(tenantId, "conversations");
  if (conversationId) {
    const ref = db.doc(conversationId);
    const snap = await ref.get();
    if (snap.exists) return conversationId;
    await ref.set({
      conversationId,
      tenantId,
      channel,
      customerReference,
      status: "open",
      messageCount: 0,
      lastMessageAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return conversationId;
  }
  const ref = db.doc();
  await ref.set({
    conversationId: ref.id,
    tenantId,
    channel,
    customerReference,
    status: "open",
    messageCount: 0,
    lastMessageAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return ref.id;
}

/**
 * Deterministic conversation id per WhatsApp customer so the agent keeps the
 * conversation history across multiple messages (web chat keeps per-session ids).
 */
export function whatsappConversationId(
  channel: ChatChannel,
  customerReference: string
): string | undefined {
  if (channel === "web") return undefined;
  const safeRef = customerReference.replace(/[^0-9a-zA-Z]/g, "").slice(0, 32);
  if (!safeRef) return undefined;
  const prefix = channel === "whatsapp_qr" ? "wa_qr" : "wa_meta";
  return `${prefix}_${safeRef}`;
}

export async function addMessage(
  tenantId: string,
  conversationId: string,
  payload: {
    direction: "inbound" | "outbound";
    senderType: "customer" | "assistant" | "staff" | "system";
    content: string;
    sourceReferences?: Array<{ title: string; category: string }>;
  }
): Promise<string> {
  const ref = tenantCollection(tenantId, "conversations")
    .doc(conversationId)
    .collection("messages")
    .doc();
  await ref.set({
    messageId: ref.id,
    tenantId,
    conversationId,
    direction: payload.direction,
    senderType: payload.senderType,
    content: payload.content,
    processingStatus: "processed",
    deliveryStatus: payload.direction === "outbound" ? "sent" : "received",
    sourceReferences: payload.sourceReferences ?? [],
    createdAt: new Date(),
  });

  await tenantDoc(tenantId, "conversations", conversationId).set(
    {
      messageCount: (await _countMessages(tenantId, conversationId)) ?? 0,
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    },
    { merge: true }
  );

  return ref.id;
}

async function _countMessages(tenantId: string, conversationId: string): Promise<number> {
  const snap = await tenantCollection(tenantId, "conversations")
    .doc(conversationId)
    .collection("messages")
    .get();
  return snap.size;
}

export async function loadHistory(
  tenantId: string,
  conversationId: string,
  limit = 16
): Promise<PromptMessage[]> {
  const snap = await tenantCollection(tenantId, "conversations")
    .doc(conversationId)
    .collection("messages")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snap.docs
    .reverse()
    .map((doc) => {
      const d = doc.data();
      const isAssistant = d.direction === "outbound";
      return {
        role: isAssistant ? ("assistant" as const) : ("user" as const),
        content: String(d.content ?? ""),
      };
    })
    .filter((m) => m.content);
}

export async function respondToCustomer(options: {
  tenantId: string;
  channel: ChatChannel;
  message: string;
  conversationId?: string;
  customerReference?: string;
}): Promise<OutboundReply> {
  const { tenantId, channel, message } = options;
  const customerReference = options.customerReference ?? "guest";

  const conversationId = await ensureConversation(
    tenantId,
    options.conversationId ?? whatsappConversationId(channel, customerReference),
    channel,
    customerReference
  );

  const history = await loadHistory(tenantId, conversationId);
  await addMessage(tenantId, conversationId, {
    direction: "inbound",
    senderType: "customer",
    content: message,
  });

  const context: TenantAiContext = await loadTenantAiContext(tenantId, message);
  const prompt = buildGroundedPrompt(context, [
    ...history,
    { role: "user", content: message },
  ]);

  const tenantKey = await getTenantApiKey(tenantId, "gemini");
  const envApiKey = process.env.GEMINI_API_KEY?.trim();
  const candidateKeys = [tenantKey?.key?.trim(), envApiKey].filter(
    (key): key is string => Boolean(key)
  );

  if (candidateKeys.length === 0) {
    await addMessage(tenantId, conversationId, {
      direction: "outbound",
      senderType: "system",
      content:
        "AI is not configured for this business yet. Please add a Gemini API key in the dashboard settings.",
    });
    throw new Error("AI key not configured");
  }

  let reply: string | undefined;
  for (const apiKey of candidateKeys) {
    try {
      reply = await generateGeminiText({
        apiKey,
        model: process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite",
        prompt,
        temperature: 0.6,
        maxOutputTokens: 700,
      });
      break;
    } catch (error: unknown) {
      console.error(
        `[ai-error] scope=respondToCustomer tenant=${tenantId} message=${
          error instanceof Error ? error.message.slice(0, 200) : "unknown"
        }`
      );
    }
  }

  if (reply === undefined) {
    reply =
      "Sorry, the AI assistant is temporarily unavailable. Please try again in a minute, or contact the business directly.";
    await addMessage(tenantId, conversationId, {
      direction: "outbound",
      senderType: "system",
      content: reply,
    });
    return { reply, conversationId, customerName: context.businessName };
  }

  await addMessage(tenantId, conversationId, {
    direction: "outbound",
    senderType: "assistant",
    content: reply,
  });

  return { reply, conversationId, customerName: context.businessName };
}
