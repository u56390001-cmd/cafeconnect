import { createHash } from "crypto";
import {
  createOrder,
  findOrderByNumber,
  hashPhone,
  OrderError,
  type OrderErrorCode,
} from "@/lib/services/orders";
import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";
import { stringsFor, type LanguageMode } from "@/lib/ai/language";

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: unknown;
}

export interface ToolContext {
  tenantId: string;
  channel: "web" | "whatsapp_meta" | "whatsapp_qr";
  conversationId: string;
  customerReference: string;
  currency: string;
  /** Language used to localize the customer-facing error text. */
  languageMode?: LanguageMode;
}

export interface ToolOutcome {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  /** Stable error code the assistant can reason about. */
  errorCode?: OrderErrorCode | "HANDOFF_RECORDED" | "MENU_NOT_FOUND";
  /** Localized, customer-safe explanation of the failure. */
  customerMessage?: string;
}

const createOrderDeclaration: ToolDeclaration = {
  name: "create_order",
  description:
    "Books a real order for the business. Use this ONLY when the customer has given every required detail: the items with quantities, their name, their phone number, and for delivery the full address. The tool prices the order from the real menu, applies eligible offers and stores the order. If the tool returns an error, tell the customer exactly what is missing (use the customerMessage field) and do not claim the order is placed.",
  parameters: {
    type: "OBJECT",
    properties: {
      items: {
        type: "ARRAY",
        description: "Items to order, using the exact itemId values from the menu list.",
        items: {
          type: "OBJECT",
          properties: {
            itemId: { type: "STRING" },
            quantity: { type: "INTEGER" },
          },
          required: ["itemId", "quantity"],
        },
      },
      customerName: { type: "STRING" },
      customerPhone: {
        type: "STRING",
        description: "Phone number with country code, digits only (e.g. 923001234567).",
      },
      fulfilmentType: {
        type: "STRING",
        format: "enum",
        enum: ["delivery", "pickup"],
      },
      address: {
        type: "STRING",
        description: "Full delivery address. Required when fulfilmentType is delivery.",
      },
      notes: { type: "STRING" },
    },
    required: ["items", "customerName", "customerPhone", "fulfilmentType"],
  },
};

const orderStatusDeclaration: ToolDeclaration = {
  name: "get_order_status",
  description:
    "Returns the status of a previously placed order. Requires the order number and the same phone number used when ordering. Use this when the customer asks about an existing order.",
  parameters: {
    type: "OBJECT",
    properties: {
      orderNumber: { type: "STRING" },
      customerPhone: { type: "STRING" },
    },
    required: ["orderNumber", "customerPhone"],
  },
};

const searchMenuDeclaration: ToolDeclaration = {
  name: "search_menu",
  description:
    "Searches the published menu for matching items (name, description, category, or a local alias such as 'chai', 'zinger', 'roll'). Use it when the customer asks about something that may not be listed verbatim, or when you are unsure which item matches their words. Returns live prices and availability.",
  parameters: {
    type: "OBJECT",
    properties: {
      query: { type: "STRING", description: "What the customer is looking for." },
      maxResults: { type: "INTEGER" },
    },
    required: ["query"],
  },
};

const quoteOrderDeclaration: ToolDeclaration = {
  name: "quote_order",
  description:
    "Returns the authoritative price for a proposed order without placing it. Use it when the customer wants a total or before asking for confirmation. The server applies real prices, real offers, the delivery fee, the minimum order value and the delivery-area rule.",
  parameters: {
    type: "OBJECT",
    properties: {
      items: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            itemId: { type: "STRING" },
            quantity: { type: "INTEGER" },
          },
          required: ["itemId", "quantity"],
        },
      },
      fulfilmentType: {
        type: "STRING",
        format: "enum",
        enum: ["delivery", "pickup"],
      },
      address: { type: "STRING" },
    },
    required: ["items", "fulfilmentType"],
  },
};

const handoffDeclaration: ToolDeclaration = {
  name: "handoff_to_staff",
  description:
    "Hands the conversation to a human team member. Use it when the customer asks for a person, when there is an unresolved payment/order dispute, a complaint, an allergy or safety question you cannot verify, or when a tool keeps failing. After calling this you must stop offering automated answers.",
  parameters: {
    type: "OBJECT",
    properties: {
      reason: { type: "STRING", description: "Short reason for the escalation." },
      summary: {
        type: "STRING",
        description:
          "Concise handover summary: what the customer wants, the order or items discussed, and what you already tried.",
      },
      priority: {
        type: "STRING",
        format: "enum",
        enum: ["normal", "high"],
      },
    },
    required: ["reason", "summary"],
  },
};

export const toolDeclarations: ToolDeclaration[] = [
  searchMenuDeclaration,
  quoteOrderDeclaration,
  createOrderDeclaration,
  orderStatusDeclaration,
  handoffDeclaration,
];

function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/[^\d]/g, "");
}

function idempotencyKeyFor(
  context: ToolContext,
  args: Record<string, unknown>
): string {
  const payload = JSON.stringify({
    items: args.items,
    phone: args.customerPhone,
    type: args.fulfilmentType,
  });
  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 20);
  const safeConv = context.conversationId.replace(/[^A-Za-z0-9]/g, "").slice(0, 20);
  return `ai_${safeConv}_${hash}`;
}


function customerMessageFor(
  context: ToolContext,
  code: OrderErrorCode,
  details: Record<string, unknown>
): string {
  const strings = stringsFor(context.languageMode ?? "en-PK");
  const money = (minor: unknown) =>
    `${context.currency} ${(Number(minor ?? 0) / 100).toFixed(0)}`;

  switch (code) {
    case "MIN_ORDER_NOT_MET":
      return strings.minOrderNotMet(money(details.minimumOrderMinor));
    case "OUT_OF_DELIVERY_AREA":
      return strings.outOfDeliveryArea;
    case "ADDRESS_REQUIRED":
      return strings.addressRequired;
    case "ITEM_UNAVAILABLE":
      return strings.itemUnavailable(String(details.itemName ?? "That item"));
    case "ITEM_NOT_FOUND":
    case "ITEM_NOT_PUBLISHED":
      return strings.itemNotFound;
    case "INVALID_CUSTOMER_PHONE":
      return strings.invalidPhone;
    case "INVALID_CUSTOMER_NAME":
      return strings.invalidName;
    case "QUOTE_EXPIRED":
      return strings.quoteExpired;
    case "INVALID_ORDER_ITEMS":
    case "INVALID_QUANTITY":
    case "INVALID_ITEM_ID":
    case "INVALID_IDEMPOTENCY_KEY":
      return strings.invalidOrderRequest;
    default:
      return strings.invalidOrderRequest;
  }
}

async function runCreateOrder(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolOutcome> {
  const rawItems = Array.isArray(args.items) ? args.items : [];
  if (rawItems.length === 0) {
    return {
      ok: false,
      error: "No items were provided for the order.",
      errorCode: "INVALID_ORDER_ITEMS",
      customerMessage: stringsFor(context.languageMode ?? "en-PK").invalidOrderRequest,
    };
  }

  const items = rawItems.map((entry) => {
    const item = entry as { itemId?: unknown; quantity?: unknown };
    return {
      itemId: String(item.itemId ?? ""),
      quantity: Number(item.quantity ?? 0),
    };
  });

  const customerPhone = normalizePhone(args.customerPhone);
  const fulfilmentType = args.fulfilmentType === "pickup" ? "pickup" : "delivery";
  const address =
    typeof args.address === "string" ? args.address.trim() : undefined;

  try {
    const result = await createOrder({
      tenantId: context.tenantId,
      items,
      customerName: String(args.customerName ?? "").trim(),
      customerPhone,
      fulfilmentType,
      address,
      notes: typeof args.notes === "string" ? args.notes : undefined,
      idempotencyKey: idempotencyKeyFor(context, {
        ...args,
        customerPhone,
        fulfilmentType,
      }),
      channel: context.channel,
      currency: context.currency,
    });

    const money = (minor: number) =>
      `${context.currency} ${(minor / 100).toFixed(0)}`;

    return {
      ok: true,
      data: {
        orderNumber: result.orderNumber,
        orderId: result.orderId,
        currency: context.currency,
        // Display strings are authoritative - the assistant must repeat them
        // exactly instead of doing its own arithmetic.
        totalLabel: money(result.pricing.totalMinor),
        subtotalLabel: money(result.pricing.subtotalMinor),
        discountLabel: money(result.pricing.discountMinor),
        deliveryFeeLabel: money(result.pricing.deliveryFeeMinor),
        totalMinor: result.pricing.totalMinor,
        subtotalMinor: result.pricing.subtotalMinor,
        discountMinor: result.pricing.discountMinor,
        deliveryFeeMinor: result.pricing.deliveryFeeMinor,
        appliedOffer: result.pricing.appliedOfferName,
        minimumOrderLabel: result.pricing.minimumOrderMinor
          ? money(result.pricing.minimumOrderMinor)
          : null,
        deliveryAreaStatus: result.pricing.deliveryAreaStatus,
        deliveryAreaLabel: result.pricing.deliveryAreaLabel,
        duplicate: result.duplicate,
      },
    };
  } catch (error: unknown) {
    if (error instanceof OrderError) {
      return {
        ok: false,
        error: error.message,
        errorCode: error.code,
        customerMessage: customerMessageFor(context, error.code, error.details),
      };
    }
    const message =
      error instanceof Error ? error.message : "Could not create the order";
    return {
      ok: false,
      error: message,
      errorCode: "INTERNAL_ERROR",
      customerMessage: stringsFor(context.languageMode ?? "en-PK").aiUnavailable,
    };
  }
}

async function runGetOrderStatus(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolOutcome> {
  const orderNumber = String(args.orderNumber ?? "").trim().toUpperCase();
  const phone = normalizePhone(args.customerPhone);
  const strings = stringsFor(context.languageMode ?? "en-PK");

  if (!orderNumber || !phone) {
    return {
      ok: false,
      error: "Order number and phone number are required.",
      errorCode: "ORDER_STATUS_UNKNOWN",
      customerMessage: strings.invalidPhone,
    };
  }

  // Indexed lookup (no collection scan).
  const indexed = await findOrderByNumber(context.tenantId, orderNumber);
  if (!indexed) {
    return {
      ok: false,
      error: "No order was found with that number.",
      errorCode: "ORDER_STATUS_UNKNOWN",
      customerMessage: strings.itemNotFound,
    };
  }

  const orderSnap = await tenantDoc(
    context.tenantId,
    "orders",
    indexed.orderId
  ).get();
  if (!orderSnap.exists) {
    return {
      ok: false,
      error: "Order document is missing.",
      errorCode: "ORDER_STATUS_UNKNOWN",
      customerMessage: strings.itemNotFound,
    };
  }

  const data = orderSnap.data()!;
  if (indexed.phoneHash && indexed.phoneHash !== hashPhone(phone)) {
    return {
      ok: false,
      error: "The phone number does not match this order.",
      errorCode: "ORDER_STATUS_UNKNOWN",
      customerMessage: strings.invalidPhone,
    };
  }

  return {
    ok: true,
    data: {
      orderNumber: data.orderNumber,
      status: data.status,
      paymentStatus: data.paymentStatus,
      totalLabel: `${data.currency ?? context.currency} ${(
        Number(data.totalMinor ?? 0) / 100
      ).toFixed(0)}`,
      totalMinor: data.totalMinor ?? 0,
      currency: data.currency ?? context.currency,
      itemCount: (data.items ?? []).reduce(
        (sum: number, item: { quantity?: number }) => sum + Number(item.quantity ?? 0),
        0
      ),
    },
  };
}

/** Searches the published menu by name, description, category or alias. */
async function runSearchMenu(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolOutcome> {
  const query = String(args.query ?? "").trim().toLowerCase();
  const maxResults = Math.min(Number(args.maxResults ?? 8) || 8, 20);
  if (!query) {
    return { ok: false, error: "A search query is required." };
  }

  const itemsSnap = await tenantCollection(context.tenantId, "menuItems")
    .where("publicationStatus", "==", "published")
    .get();

  const terms = query.split(/\s+/).filter(Boolean);
  const matches = itemsSnap.docs
    .map((doc) => {
      const d = doc.data();
      const haystack = [d.name, d.description, d.categoryId, d.aliases]
        .flat()
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLowerCase();
      const score = terms.reduce(
        (sum, term) => sum + (haystack.includes(term) ? 1 : 0),
        0
      );
      return { doc, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  const results = matches.map(({ doc }) => {
    const d = doc.data();
    const minor = Number(d.basePriceMinor ?? 0);
    return {
      itemId: d.itemId || doc.id,
      name: d.name,
      description: d.description || "",
      priceLabel: `${context.currency} ${(minor / 100).toFixed(0)}`,
      availability: d.availability ?? "available",
    };
  });

  return { ok: true, data: { results, count: results.length } };
}

/** Authoritative quote without creating an order. */
async function runQuoteOrder(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolOutcome> {
  const rawItems = Array.isArray(args.items) ? args.items : [];
  if (rawItems.length === 0) {
    return {
      ok: false,
      error: "No items were provided for the quote.",
      errorCode: "INVALID_ORDER_ITEMS",
      customerMessage: stringsFor(context.languageMode ?? "en-PK").invalidOrderRequest,
    };
  }

  const items = rawItems.map((entry) => {
    const item = entry as { itemId?: unknown; quantity?: unknown };
    return {
      itemId: String(item.itemId ?? ""),
      quantity: Number(item.quantity ?? 0),
    };
  });

  const fulfilmentType = args.fulfilmentType === "pickup" ? "pickup" : "delivery";
  const address = typeof args.address === "string" ? args.address.trim() : undefined;

  try {
    // A quote uses the same pricing/rules path but never stores an order.
    const result = await createOrder({
      tenantId: context.tenantId,
      items,
      customerName: "quote",
      customerPhone: "0000000000",
      fulfilmentType,
      address: fulfilmentType === "delivery" ? address : undefined,
      idempotencyKey: `quote_${createHash("sha256")
        .update(
          JSON.stringify({ items, context: context.conversationId, fulfilmentType })
        )
        .digest("hex")
        .slice(0, 24)}`,
      channel: context.channel,
      currency: context.currency,
    });

    const money = (minor: number) =>
      `${context.currency} ${(minor / 100).toFixed(0)}`;

    return {
      ok: true,
      data: {
        totalLabel: money(result.pricing.totalMinor),
        subtotalLabel: money(result.pricing.subtotalMinor),
        discountLabel: money(result.pricing.discountMinor),
        deliveryFeeLabel: money(result.pricing.deliveryFeeMinor),
        appliedOffer: result.pricing.appliedOfferName,
        minimumOrderLabel: result.pricing.minimumOrderMinor
          ? money(result.pricing.minimumOrderMinor)
          : null,
        deliveryAreaStatus: result.pricing.deliveryAreaStatus,
        deliveryAreaLabel: result.pricing.deliveryAreaLabel,
        note: "Quote only. No order was created.",
      },
    };
  } catch (error: unknown) {
    if (error instanceof OrderError) {
      return {
        ok: false,
        error: error.message,
        errorCode: error.code,
        customerMessage: customerMessageFor(context, error.code, error.details),
      };
    }
    return {
      ok: false,
      error: "Could not build the quote.",
      errorCode: "INTERNAL_ERROR",
      customerMessage: stringsFor(context.languageMode ?? "en-PK").aiUnavailable,
    };
  }
}

/** Hands the conversation to a human. */
async function runHandoffToStaff(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolOutcome> {
  const reason = String(args.reason ?? "").trim().slice(0, 300);
  const summary = String(args.summary ?? "").trim().slice(0, 1000);
  const priority = args.priority === "high" ? "high" : "normal";

  if (!reason || !summary) {
    return {
      ok: false,
      error: "A reason and a summary are required for a handoff.",
    };
  }

  const now = new Date();
  await tenantDoc(context.tenantId, "conversations", context.conversationId).set(
    {
      status: "waitingForHuman",
      aiEnabled: false,
      handoff: {
        reason,
        summary,
        priority,
        requestedBy: "ai",
        channel: context.channel,
        createdAt: now,
      },
      updatedAt: now,
    },
    { merge: true }
  );

  return {
    ok: true,
    errorCode: "HANDOFF_RECORDED",
    data: {
      status: "waitingForHuman",
      priority,
      customerMessage: stringsFor(context.languageMode ?? "en-PK").humanRequested,
    },
  };
}

export async function runTool(
  name: string,
  rawArgs: unknown,
  context: ToolContext
): Promise<ToolOutcome> {
  const args =
    rawArgs && typeof rawArgs === "object"
      ? (rawArgs as Record<string, unknown>)
      : {};

  switch (name) {
    case "search_menu":
      return runSearchMenu(args, context);
    case "quote_order":
      return runQuoteOrder(args, context);
    case "create_order":
      return runCreateOrder(args, context);
    case "get_order_status":
      return runGetOrderStatus(args, context);
    case "handoff_to_staff":
      return runHandoffToStaff(args, context);
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}





