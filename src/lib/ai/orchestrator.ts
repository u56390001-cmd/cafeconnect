import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";
import { FieldValue } from "firebase-admin/firestore";
import { getTenantApiKey } from "@/lib/settings/keys";
import { loadTenantAiContext, type TenantAiContext } from "./context-builder";
import { buildGroundedPrompt, type PromptMessage } from "./prompt-builder";
import { generateGeminiText, generateGeminiTextWithTools, generateGeminiTextWithToolsStream } from "./gemini-client";
import { runTool, toolDeclarations, type ToolContext } from "./tools";

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

  // Message write and conversation update run in parallel (two round trips
  // instead of three sequential ones).
  await Promise.all([
    ref.set({
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
    }),
    tenantDoc(tenantId, "conversations", conversationId).set(
      {
        messageCount: FieldValue.increment(1),
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    ),
  ]);

  return ref.id;
}

export async function loadHistory(
  tenantId: string,
  conversationId: string,
  limit = 8
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
  onDelta?: (chunk: string) => void;
}): Promise<OutboundReply> {
  const startedAt = Date.now();
  const { tenantId, channel, message, onDelta } = options;
  const customerReference = options.customerReference ?? "guest";

  const conversationId = await ensureConversation(
    tenantId,
    options.conversationId ?? whatsappConversationId(channel, customerReference),
    channel,
    customerReference
  );

  // Load history and tenant context in parallel.
  const [history, context] = await Promise.all([
    loadHistory(tenantId, conversationId),
    loadTenantAiContext(tenantId, message),
  ]);
  const contextReadyAt = Date.now();

  await addMessage(tenantId, conversationId, {
    direction: "inbound",
    senderType: "customer",
    content: message,
  });

  const prompt = buildGroundedPrompt(context, [
    ...history,
    { role: "user", content: message },
  ]);

  const tenantKey = await getTenantApiKey(tenantId, "gemini");
  const envApiKey = process.env.GEMINI_API_KEY?.trim();
  // Deduplicate: the tenant key and the platform key are often the same value.
  const candidateKeys = Array.from(
    new Set(
      [tenantKey?.key?.trim(), envApiKey].filter(
        (key): key is string => Boolean(key)
      )
    )
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

  const toolContext: ToolContext = {
    tenantId,
    channel,
    conversationId,
    customerReference,
    currency: context.currency,
  };

  let reply: string | undefined;
  let streamedAny = false;
  const toolState: {
    order: { orderNumber: string; totalLabel?: string } | null;
  } = { order: null };

  const captureToolOutcome = (
    name: string,
    outcome: { ok: boolean; data?: Record<string, unknown>; error?: string }
  ) => {
    if (name === "create_order" && outcome.ok && outcome.data?.orderNumber) {
      toolState.order = {
        orderNumber: String(outcome.data.orderNumber),
        totalLabel: outcome.data.totalLabel
          ? String(outcome.data.totalLabel)
          : undefined,
      };
    }
  };

  for (const apiKey of candidateKeys) {
    try {
      if (onDelta) {
        reply = await generateGeminiTextWithToolsStream({
          apiKey,
          model: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
          prompt,
          tools: toolDeclarations,
          toolContext,
          onDelta: (chunk) => {
            streamedAny = true;
            onDelta?.(chunk);
          },
          onToolOutcome: captureToolOutcome,
        });
      } else {
        reply = await generateGeminiTextWithTools({
          apiKey,
          model: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
          prompt,
          tools: toolDeclarations,
          toolContext,
          onToolOutcome: captureToolOutcome,
        });
      }
      break;
    } catch (error: unknown) {
      console.error(
        `[ai-error] scope=respondToCustomer tenant=${tenantId} message=${
          error instanceof Error ? error.message.slice(0, 200) : "unknown"
        }`
      );
      // Never generate twice for one customer message: if text was already
      // streamed, keep it and stop trying other keys/models.
      if (streamedAny) break;
    }
  }

  const modelDoneAt = Date.now();

  if (reply === undefined) {
    // If the order was actually created before the reply failed, the customer
    // must still be told the real order number (never a false success).
    reply = toolState.order
      ? `Aapka order #${toolState.order.orderNumber} receive ho gaya hai${
          toolState.order.totalLabel ? `, total ${toolState.order.totalLabel}` : ""
        }. Hamari team 10 minutes mein phone par order confirm karegi.`
      : "Sorry, the AI assistant is temporarily unavailable. Please try again in a minute, or contact the business directly.";
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

  console.log(
    `[ai-timing] tenant=${tenantId} channel=${channel} contextMs=${
      contextReadyAt - startedAt
    } modelMs=${modelDoneAt - contextReadyAt} totalMs=${Date.now() - startedAt}`
  );

  return { reply, conversationId, customerName: context.businessName };
}

export { generateGeminiText };

