import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";
import { FieldValue } from "@/lib/firebase/admin";
import { randomUUID } from "crypto";
import { getTenantApiKey } from "@/lib/settings/keys";
import { loadTenantAiContext, type TenantAiContext } from "./context-builder";
import { buildGroundedPrompt, PROMPT_VERSION, type PromptMessage } from "./prompt-builder";
import { generateGeminiText, generateGeminiTextWithTools, generateGeminiTextWithToolsStream } from "./gemini-client";
import { runTool, toolDeclarations, type ToolContext } from "./tools";
import { cartIdForConversation, getCart } from "@/lib/services/carts";
import { detectLanguage, stringsFor, type LanguageMode } from "./language";
import {
  enrichProducts,
  looksLikeBrowseRequest,
  parseWidgetBlocks,
  resolveBrowseProducts,
  type WidgetBlock,
  type WidgetCartSummary,
  type WidgetOrderSummary,
} from "@/lib/widget/ui-contract";
import {
  buildStateBlock,
  deriveActiveIntent,
  deriveCompactSummary,
  deriveMissingOrderDetails,
  persistState,
  type ConversationState,
  type PersistedState,
} from "./conversation-state";

export type ChatChannel = "web" | "whatsapp_meta" | "whatsapp_qr";

/** Builds the cart layer that is injected into the prompt. */
function buildCartSummary(
  state: ConversationState,
  cart: Awaited<ReturnType<typeof getCart>>
): string {
  if (!cart || !cart.items || cart.items.length === 0) {
    return "Cart is empty (no items yet).";
  }
  const lines = cart.items.map((line) => `${line.quantity}x ${line.name}`);
  const quote = cart.currentQuote;
  return [
    `Items: ${lines.join(", ")}`,
    `Cart revision: ${cart.cartRevision}`,
    quote
      ? `Current quote (revision ${quote.revision}): ${quote.totalLabel}${
          quote.appliedOffer ? ` (${quote.appliedOffer})` : ""
        }`
      : "No valid quote yet - call quote_order before confirming.",
    `Fulfilment: ${cart.fulfilment?.type ?? "not set"}`,
    `Customer: ${cart.customer?.name ?? "not given"} / ${
      cart.customer?.phone ?? "no phone"
    }`,
    state.missingOrderDetails.length > 0
      ? `Still needed: ${state.missingOrderDetails.join(", ")}`
      : "All order details collected.",
  ].join("\n");
}

/** Per-turn observability (blueprint §11.1). */
export interface TurnMetrics {
  requestId: string;
  promptVersion: string;
  channel: ChatChannel;
  languageMode: string;
  stages: {
    historyAndContextMs: number;
    promptAssemblyMs: number;
    modelMs?: number;
    firstTokenMs?: number;
    persistMs?: number;
    totalMs?: number;
  };
  model: string | null;
  attempts: number;
  toolCalls: Array<{ name: string; ok: boolean; ms: number }>;
  fallbackUsed: boolean;
  cacheHit: boolean | null;
}

export interface OutboundReply {
  reply: string;
  conversationId: string;
  customerName: string | null;
  /** True when the assistant deliberately stayed silent (staff-owned chat). */
  suppressed?: boolean;
  languageMode?: LanguageMode;
  requestId?: string;
  /** Verified UI blocks for the web widget (never model supplied data). */
  ui?: WidgetBlock[];
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
  /** Stable first-party visitor id (web) or verified phone (WhatsApp). */
  identity?: string;
  onDelta?: (chunk: string) => void;
}): Promise<OutboundReply> {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const { tenantId, channel, message, onDelta } = options;
  const customerReference = options.customerReference ?? "guest";

  const conversationId = await ensureConversation(
    tenantId,
    options.conversationId ?? whatsappConversationId(channel, customerReference),
    channel,
    customerReference
  );

  // --- Staff-owned conversations are never auto-answered ---------------
  const conversationSnap = await tenantDoc(
    tenantId,
    "conversations",
    conversationId
  ).get();
  const conversation = conversationSnap.data() ?? {};
  const aiEnabled = conversation.aiEnabled !== false;
  const status = String(conversation.status ?? "open");

  if (!aiEnabled || status === "waitingForHuman" || status === "closed") {
    // Persist the customer message so staff can see it, but do not reply.
    await addMessage(tenantId, conversationId, {
      direction: "inbound",
      senderType: "customer",
      content: message,
    });
    console.log(
      `[ai-suppressed] requestId=${requestId} tenant=${tenantId} channel=${channel} status=${status} aiEnabled=${aiEnabled}`
    );
    return {
      reply: "",
      conversationId,
      customerName: null,
      suppressed: true,
      requestId,
    };
  }

  // Load history and tenant context in parallel.
  const [history, context] = await Promise.all([
    loadHistory(tenantId, conversationId),
    loadTenantAiContext(tenantId, message),
  ]);
  const contextReadyAt = Date.now();

  const languageMode = detectLanguage(
    message,
    context.aiSettings.language
  ).mode;
  const strings = stringsFor(languageMode);

  // --- Conversation state layer (Phase 1) -----------------------------
  const persisted = (conversation ?? {}) as PersistedState;
  const historyTexts = history.map((h) => h.content);
  const cart = await getCart(tenantId, cartIdForConversation(conversationId));
  const state: ConversationState = {
    activeIntent: deriveActiveIntent(message),
    missingOrderDetails: deriveMissingOrderDetails(message, historyTexts),
    mentionedItems: cart?.items.map((line) => line.name) ?? [],
    cartRevision: Number(cart?.cartRevision ?? persisted.cartRevision ?? 0),
    lastVerifiedQuote: cart?.currentQuote?.totalLabel ?? persisted.lastVerifiedQuote ?? null,
    lastOrderNumber: cart?.lastOrderNumber ?? persisted.lastOrderNumber ?? null,
    handoffStatus: status,
    compactSummary: deriveCompactSummary(history),
    stateVersion: Number(persisted.stateVersion ?? 0) + 1,
  };

  // Persist the inbound message while the model is generating (saves a round
  // trip and keeps the conversation durable even if generation fails).
  const inboundWrite = addMessage(tenantId, conversationId, {
    direction: "inbound",
    senderType: "customer",
    content: message,
  });

  // --- Customer identity + memory (Phase 3) ----------------------------
  const identityChannel =
    channel === "web" ? "web" : channel === "whatsapp_qr" ? "whatsapp_qr" : "whatsapp_meta";
  const identityValue =
    options.identity?.trim() ||
    (channel === "web" ? customerReference : customerReference);

  let customerId: string | null = null;
  let memoryBlock = "(no memory: memory is disabled or not permitted for this customer)";
  if (identityValue) {
    try {
      const { resolveCustomer } = await import("@/lib/customers/identity");
      const { listMemories, renderMemoryBlock, memoryEnabled } = await import(
        "@/lib/customers/memory"
      );
      const resolved = await resolveCustomer({
        tenantId,
        channel: identityChannel,
        identifier: identityValue,
      });
      customerId = resolved.customerId;
      if (memoryEnabled(resolved.profile)) {
        const memories = await listMemories(tenantId, resolved.customerId);
        memoryBlock = renderMemoryBlock(resolved.profile, memories);
      }
    } catch (error: unknown) {
      // Memory must never block a customer turn.
      console.error(
        `[ai-error] scope=resolveCustomer tenant=${tenantId} message=${
          error instanceof Error ? error.message.slice(0, 120) : "unknown"
        }`
      );
    }
  }

  const prompt = buildGroundedPrompt(context, [
    ...history,
    { role: "user", content: message },
  ], {
    languageMode,
    conversationStatus: status,
    stateSummary: buildStateBlock(state),
    cartSummary: buildCartSummary(state, cart),
    memorySummary: memoryBlock,
  });
  const promptReadyAt = Date.now();

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
    languageMode,
    cartId: await resolveCartId(tenantId, conversationId, channel, customerReference),
    customerId,
  };

  let reply: string | undefined;
  let streamedAny = false;
  const toolState: {
    order: { orderNumber: string; totalLabel?: string } | null;
    lastErrorMessage: string | null;
    recommendedItemIds: string[];
    orderId: string | null;
    /** Product ids found by verified tools (rendered as cards). */
    productIds: string[];
    /** Verified cart snapshot for the cart panel. */
    cart: Record<string, unknown> | null;
    /** Verified order snapshot for the receipt card. */
    orderSnapshot: Record<string, unknown> | null;
    handoff: string | null;
  } = {
    order: null,
    lastErrorMessage: null,
    recommendedItemIds: [],
    orderId: null,
    productIds: [],
    cart: null,
    orderSnapshot: null,
    handoff: null,
  };

  const captureToolOutcome = (
    name: string,
    outcome: {
      ok: boolean;
      data?: Record<string, unknown>;
      error?: string;
      errorCode?: string;
      customerMessage?: string;
    }
  ) => {
    if (name === "create_order" && outcome.ok && outcome.data?.orderNumber) {
      toolState.order = {
        orderNumber: String(outcome.data.orderNumber),
        totalLabel: outcome.data.totalLabel
          ? String(outcome.data.totalLabel)
          : undefined,
      };
      toolState.orderId = outcome.data.orderId
        ? String(outcome.data.orderId)
        : null;
      toolState.orderSnapshot = outcome.data
        ? { ...(outcome.data as Record<string, unknown>) }
        : null;
      return;
    }
    if (name === "recommend_items" && outcome.ok) {
      const list = Array.isArray(outcome.data?.recommendations)
        ? (outcome.data?.recommendations as Array<{ itemId?: unknown }>)
        : [];
      const ids = list
        .map((item) => String(item.itemId ?? ""))
        .filter(Boolean);
      if (ids.length) {
        toolState.recommendedItemIds = ids;
        toolState.productIds.push(...ids);
      }
      return;
    }
    if (name === "search_menu" && outcome.ok) {
      const list = Array.isArray(outcome.data?.results)
        ? (outcome.data?.results as Array<{ itemId?: unknown }>)
        : [];
      const ids = list
        .map((item) => String(item.itemId ?? ""))
        .filter(Boolean);
      if (ids.length) toolState.productIds.push(...ids);
      return;
    }
    if (name === "show_products" && outcome.ok) {
      const list = Array.isArray(outcome.data?.results)
        ? (outcome.data?.results as Array<{ itemId?: unknown }>)
        : [];
      const ids = list
        .map((item) => String(item.itemId ?? ""))
        .filter(Boolean);
      if (ids.length) toolState.productIds.push(...ids);
      return;
    }
    if (name === "update_cart" && outcome.ok) {
      if (outcome.data?.cart) {
        toolState.cart = outcome.data.cart as Record<string, unknown>;
      }
      return;
    }
    if (name === "quote_order" && outcome.ok) {
      if (outcome.data?.cart) {
        toolState.cart = outcome.data.cart as Record<string, unknown>;
      }
      return;
    }
    if (name === "create_order" && outcome.ok) {
      toolState.orderSnapshot = outcome.data
        ? { ...(outcome.data as Record<string, unknown>) }
        : null;
      return;
    }
    if (name === "handoff_to_staff" && outcome.ok) {
      toolState.handoff =
        typeof outcome.data?.message === "string"
          ? outcome.data.message
          : "A staff member will take over this chat.";
      return;
    }
    if (!outcome.ok) {
      const message =
        outcome.customerMessage ??
        (typeof outcome.data?.customerMessage === "string"
          ? (outcome.data?.customerMessage as string)
          : null);
      toolState.lastErrorMessage =
        typeof message === "string" && message.trim() ? message : null;
    }
  };

  // Overall AI budget for this turn (blueprint: bounded request deadline).
  const aiDeadline = Date.now() + 12_000;
  const metrics: TurnMetrics = {
    requestId,
    promptVersion: PROMPT_VERSION,
    channel,
    languageMode,
    stages: {
      historyAndContextMs: contextReadyAt - startedAt,
      promptAssemblyMs: promptReadyAt - contextReadyAt,
    },
    model: null,
    attempts: 0,
    toolCalls: [],
    fallbackUsed: false,
    cacheHit: null,
  };

  for (const apiKey of candidateKeys) {
    metrics.attempts += 1;
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
          deadline: aiDeadline,
          metrics,
        });
      } else {
        reply = await generateGeminiTextWithTools({
          apiKey,
          model: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
          prompt,
          tools: toolDeclarations,
          toolContext,
          onToolOutcome: captureToolOutcome,
          deadline: aiDeadline,
          metrics,
        });
      }
      break;
    } catch (error: unknown) {
      console.error(
        `[ai-error] requestId=${requestId} scope=respondToCustomer tenant=${tenantId} message=${
          error instanceof Error ? error.message.slice(0, 200) : "unknown"
        }`
      );
      // Never generate twice for one customer message: if text was already
      // streamed, keep it and stop trying other keys/models.
      if (streamedAny) break;
    }
  }


  const modelDoneAt = Date.now();
  await inboundWrite.catch(() => undefined);

  metrics.stages.modelMs = modelDoneAt - promptReadyAt;
  metrics.fallbackUsed = reply === undefined;

  if (reply === undefined) {
    // Deterministic, truthful fallback: if the order was created before the
    // model failed, the customer still gets the real order number. Never a
    // false success, never an empty reply.
    reply = toolState.order
      ? `${strings.orderCreated(
          toolState.order.orderNumber,
          toolState.order.totalLabel ?? ""
        )} ${strings.orderConfirmCall}`
      : toolState.lastErrorMessage ?? strings.aiUnavailable;
    await addMessage(tenantId, conversationId, {
      direction: "outbound",
      senderType: "system",
      content: reply,
    });
    metrics.stages.totalMs = Date.now() - startedAt;
    await persistState(tenantId, conversationId, state, PROMPT_VERSION);
    await persistTurnMetrics(tenantId, conversationId, requestId, metrics);
    return {
      reply,
      conversationId,
      customerName: context.businessName,
      languageMode,
      requestId,
      // Even the fallback keeps the verified blocks (cart, receipt, cards).
      ui: await buildWidgetBlocks({
        tenantId,
        channel,
        currency: context.currency,
        productIds: toolState.productIds,
        cart: toolState.cart,
        order: toolState.orderSnapshot,
        handoff: toolState.handoff,
        message,
      }),
    };
  }

  // Safety net: a confirmed order must always carry its real order number,
  // even if the model forgot it in the wording.
  if (toolState.order && !reply.includes(toolState.order.orderNumber)) {
    reply = `${reply}\n${strings.orderCreated(
      toolState.order.orderNumber,
      toolState.order.totalLabel ?? ""
    )}`.trim();
  }

  await addMessage(tenantId, conversationId, {
    direction: "outbound",
    senderType: "assistant",
    content: reply,
  });

  // Persist the derived state so the next turn can build on it.
  if (toolState.order) {
    state.lastOrderNumber = toolState.order.orderNumber;
    state.lastVerifiedQuote = toolState.order.totalLabel ?? null;
    state.cartRevision += 1;

    // Attribution: which recommended items actually made it into the order.
    if (toolState.recommendedItemIds.length > 0 && toolState.orderId) {
      try {
        await tenantCollection(tenantId, "orders")
          .doc(toolState.orderId)
          .set(
            {
              attribution: {
                recommendedItemIds: toolState.recommendedItemIds,
                customerId,
              },
            },
            { merge: true }
          );
      } catch {
        // attribution is best effort
      }
    }
  }
  await persistState(tenantId, conversationId, state, PROMPT_VERSION);

  metrics.stages.totalMs = Date.now() - startedAt;
  await persistTurnMetrics(tenantId, conversationId, requestId, metrics);

  // Durable memory extraction: queued now, processed in the background and
  // retried by the cron worker if needed. It never delays the reply.
  if (customerId) {
    try {
      const { enqueueMemoryJob, processMemoryJob } = await import(
        "@/lib/customers/jobs"
      );
      const jobId = await enqueueMemoryJob({
        tenantId,
        customerId,
        conversationId,
        channel,
        customerMessage: message,
        assistantMessage: reply,
      });
      if (jobId) {
        // Keep the function alive so the job actually runs; the cron worker
        // retries anything that is still pending.
        const job = processMemoryJob(tenantId, jobId).catch(() => undefined);
        try {
          const { waitUntil } = await import("@vercel/functions");
          waitUntil(job);
        } catch {
          void job;
        }
      }
    } catch (error: unknown) {
      console.error(
        `[ai-error] scope=enqueueMemoryJob tenant=${tenantId} message=${
          error instanceof Error ? error.message.slice(0, 120) : "unknown"
        }`
      );
    }
  }

  console.log(
    `[ai-timing] requestId=${requestId} tenant=${tenantId} channel=${channel} lang=${languageMode} model=${
      metrics.model ?? "none"
    } attempts=${metrics.attempts} contextMs=${
      contextReadyAt - startedAt
    } modelMs=${modelDoneAt - contextReadyAt} totalMs=${Date.now() - startedAt}`
  );

  return {
    reply,
    conversationId,
    customerName: context.businessName,
    languageMode,
    requestId,
    ui: await buildWidgetBlocks({
      tenantId,
      channel,
      currency: context.currency,
      productIds: toolState.productIds,
      cart: toolState.cart,
      order: toolState.orderSnapshot,
      handoff: toolState.handoff,
      message,
    }),
  };
}

/**
 * Turns verified tool results into the widget response contract.
 *
 * Only data that came back from a server-side tool is rendered. No model
 * supplied product, price or image ever reaches a card.
 */
async function buildWidgetBlocks(input: {
  tenantId: string;
  channel: string;
  currency: string;
  productIds: string[];
  cart: Record<string, unknown> | null;
  order: Record<string, unknown> | null;
  handoff: string | null;
  message: string;
}): Promise<WidgetBlock[]> {
  const blocks: WidgetBlock[] = [];

  try {
    if (input.productIds.length > 0) {
      const products = await enrichProducts(
        input.tenantId,
        input.productIds,
        { currency: input.currency, showImages: true }
      );
      if (products.length > 0) {
        blocks.push({
          type: products.length > 4 ? "product_list" : "product_carousel",
          products,
        });
      }
    } else if (looksLikeBrowseRequest(input.message)) {
      // The model did not ask for cards, but the customer clearly wants to
      // see products: resolve the matching live items server side.
      const products = await resolveBrowseProducts(
        input.tenantId,
        input.message,
        { currency: input.currency, showImages: true }
      );
      if (products.length > 0) {
        blocks.push({
          type: products.length > 4 ? "product_list" : "product_carousel",
          products,
        });
      }
    }

    if (input.order?.orderNumber) {
      const order = input.order as unknown as WidgetOrderSummary;
      blocks.push({
        type: "order_confirmation",
        order: {
          orderId: String(order.orderId ?? ""),
          orderNumber: String(order.orderNumber ?? ""),
          totalLabel: String(order.totalLabel ?? ""),
          subtotalLabel: String(order.subtotalLabel ?? ""),
          discountLabel: String(order.discountLabel ?? ""),
          deliveryFeeLabel: String(order.deliveryFeeLabel ?? ""),
          fulfilmentType: String(order.fulfilmentType ?? "delivery"),
          address: order.address ?? null,
          itemCount: (order.lines ?? []).reduce(
            (sum, line) => sum + (line.quantity ?? 0),
            0
          ),
          lines: order.lines ?? [],
          trackUrl: null,
          status: String(order.status ?? "received"),
        },
      });
    } else if (input.cart) {
      const cart = input.cart as unknown as WidgetCartSummary;
      blocks.push({
        type: "cart_summary",
        cart: {
          cartId: String(cart.cartId ?? ""),
          revision: Number(cart.revision ?? 0),
          itemCount: Number(cart.itemCount ?? 0),
          subtotalMinor: Number(cart.subtotalMinor ?? 0),
          subtotalLabel:
            cart.subtotalLabel ??
            `${input.currency} ${Math.round(Number(cart.subtotalMinor ?? 0) / 100)}`,
          discountMinor: Number(cart.discountMinor ?? 0),
          discountLabel:
            cart.discountLabel ??
            `${input.currency} ${Math.round(Number(cart.discountMinor ?? 0) / 100)}`,
          deliveryFeeMinor: Number(cart.deliveryFeeMinor ?? 0),
          deliveryFeeLabel:
            cart.deliveryFeeLabel ??
            `${input.currency} ${Math.round(Number(cart.deliveryFeeMinor ?? 0) / 100)}`,
          totalMinor: Number(cart.totalMinor ?? 0),
          totalLabel:
            cart.totalLabel ??
            `${input.currency} ${Math.round(Number(cart.totalMinor ?? 0) / 100)}`,
          appliedOffer: cart.appliedOffer ?? null,
          minimumOrderLabel: cart.minimumOrderLabel ?? null,
          deliveryAreaStatus: String(cart.deliveryAreaStatus ?? "not_applicable"),
          lines: cart.lines ?? [],
          // Without a fresh quote the number is a subtotal, not a final total.
          totalIsFinal: typeof cart.totalMinor === "number" && cart.totalMinor > 0,
        },
      });
    }

    if (input.handoff) {
      blocks.push({ type: "handoff", text: input.handoff });
    }
  } catch (error: unknown) {
    // Rich blocks are an enhancement - the text reply still stands.
    console.error(
      `[ai-error] scope=buildWidgetBlocks tenant=${input.tenantId} message=${
        error instanceof Error ? error.message.slice(0, 120) : "unknown"
      }`
    );
  }

  return parseWidgetBlocks(blocks);
}

/** Ensures the conversation has an active cart and returns its id. */
async function resolveCartId(
  tenantId: string,
  conversationId: string,
  channel: ChatChannel,
  customerReference: string
): Promise<string> {
  const { ensureCart } = await import("@/lib/services/carts");
  const cart = await ensureCart({
    tenantId,
    conversationId,
    channel,
    customerReference,
  });
  return cart.cartId;
}

/** Stores the per-turn metrics so they are observable in the dashboard. */
async function persistTurnMetrics(
  tenantId: string,
  conversationId: string,
  requestId: string,
  metrics: TurnMetrics
): Promise<void> {
  try {
    const { tenantDoc } = await import("@/lib/tenancy/resolver");
    await tenantDoc(tenantId, "conversations", conversationId)
      .collection("turnMetrics")
      .doc(requestId)
      .set(
        {
          requestId,
          promptVersion: metrics.promptVersion,
          channel: metrics.channel,
          languageMode: metrics.languageMode,
          model: metrics.model,
          attempts: metrics.attempts,
          toolCalls: metrics.toolCalls,
          fallbackUsed: metrics.fallbackUsed,
          stages: metrics.stages,
          createdAt: new Date(),
        },
        { merge: true }
      );
  } catch (error: unknown) {
    console.error(
      `[ai-error] scope=persistTurnMetrics message=${
        error instanceof Error ? error.message.slice(0, 120) : "unknown"
      }`
    );
  }
}

export { generateGeminiText };


