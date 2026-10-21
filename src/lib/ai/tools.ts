import { createHash } from "crypto";
import {
  findOrderByNumber,
  hashPhone,
  OrderError,
  type OrderErrorCode,
} from "@/lib/services/orders";
import {
  CartError,
  describeCart,
  ensureCart,
  quoteCart,
  submitCart,
  updateCart,
  type CartErrorCode,
} from "@/lib/services/carts";
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
  /** Active cart for this conversation (one cart per conversation). */
  cartId?: string;
}

export interface ToolOutcome {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  /** Stable error code the assistant can reason about. */
  errorCode?: OrderErrorCode | CartErrorCode | "HANDOFF_RECORDED" | "MENU_NOT_FOUND";
  /** Localized, customer-safe explanation of the failure. */
  customerMessage?: string;
}

// ---------------------------------------------------------------------------
// Tool declarations (what the model may call)
// ---------------------------------------------------------------------------

const searchMenuDeclaration: ToolDeclaration = {
  name: "search_menu",
  description:
    "Searches the published menu for matching items (name, description, category, or a local alias such as 'chai', 'zinger', 'roll', 'karahi'). Use it when the customer asks about something that may not be listed verbatim, or when you are unsure which item matches their words. Returns live prices and availability.",
  parameters: {
    type: "OBJECT",
    properties: {
      query: { type: "STRING", description: "What the customer is looking for." },
      maxResults: { type: "INTEGER" },
    },
    required: ["query"],
  },
};

const updateCartDeclaration: ToolDeclaration = {
  name: "update_cart",
  description:
    "Changes the customer's current order cart. Use it whenever the customer adds, removes or changes items, changes delivery/pickup, or gives their name/phone/address. The server validates every item against the live menu, merges corrections into the existing cart (it never duplicates lines) and recalculates the revision. Always call it before quoting or ordering.",
  parameters: {
    type: "OBJECT",
    properties: {
      operation: {
        type: "STRING",
        format: "enum",
        enum: ["add", "remove", "set", "clear"],
        description:
          "add = add to what is already there, remove = remove a quantity, set = replace the quantity of an item, clear = empty the cart.",
      },
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
      customerName: { type: "STRING" },
      customerPhone: { type: "STRING" },
      notes: { type: "STRING" },
    },
    required: ["operation"],
  },
};

const quoteOrderDeclaration: ToolDeclaration = {
  name: "quote_order",
  description:
    "Prices the customer's current cart and returns the authoritative total (server-side prices, real offers, delivery fee, minimum order and delivery-area check) WITHOUT placing the order. Call it after update_cart, then show the customer the total and ask them to confirm.",
  parameters: {
    type: "OBJECT",
    properties: {
      cartId: {
        type: "STRING",
        description: "Optional. The current cart is used when omitted.",
      },
    },
  },
};

const createOrderDeclaration: ToolDeclaration = {
  name: "create_order",
  description:
    "Places the customer's order. It requires a fresh quote for the current cart revision: call quote_order first, then create_order only after the customer confirmed. The tool re-validates prices and availability, and is safe to retry: repeating it returns the same order instead of creating a second one. If it returns an error, tell the customer exactly what is missing (use the customerMessage field) and do not claim the order is placed.",
  parameters: {
    type: "OBJECT",
    properties: {
      cartId: {
        type: "STRING",
        description: "Optional. The current cart is used when omitted.",
      },
      customerName: { type: "STRING" },
      customerPhone: {
        type: "STRING",
        description: "Phone number with country code, digits only (e.g. 923001234567).",
      },
      address: { type: "STRING" },
      notes: { type: "STRING" },
    },
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
  updateCartDeclaration,
  quoteOrderDeclaration,
  createOrderDeclaration,
  orderStatusDeclaration,
  handoffDeclaration,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/[^\d]/g, "");
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
    default:
      return strings.invalidOrderRequest;
  }
}

/** Maps a cart/order failure to a localized, customer-safe message. */
function cartFailure(context: ToolContext, error: unknown): ToolOutcome {
  const strings = stringsFor(context.languageMode ?? "en-PK");
  if (error instanceof CartError) {
    const code = error.code as CartErrorCode;
    const details = error.details ?? {};
    let message = strings.invalidOrderRequest;
    switch (code) {
      case "MIN_ORDER_NOT_MET":
        message = strings.minOrderNotMet(
          details.minimumOrderMinor
            ? `${context.currency} ${(
                Number(details.minimumOrderMinor) / 100
              ).toFixed(0)}`
            : ""
        );
        break;
      case "OUT_OF_DELIVERY_AREA":
        message = strings.outOfDeliveryArea;
        break;
      case "ADDRESS_REQUIRED":
        message = strings.addressRequired;
        break;
      case "ITEM_UNAVAILABLE":
        message = strings.itemUnavailable(
          String(details.itemName ?? "That item")
        );
        break;
      case "ITEM_NOT_FOUND":
      case "ITEM_NOT_PUBLISHED":
        message = strings.itemNotFound;
        break;
      case "INVALID_CUSTOMER_PHONE":
        message = strings.invalidPhone;
        break;
      case "INVALID_CUSTOMER_NAME":
        message = strings.invalidName;
        break;
      case "QUOTE_EXPIRED":
      case "QUOTE_REVISION_CHANGED":
      case "QUOTE_NOT_FOUND":
        message = strings.quoteExpired;
        break;
      default:
        message = strings.invalidOrderRequest;
    }
    return {
      ok: false,
      error: error.message,
      errorCode: code,
      customerMessage: message,
    };
  }
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
    error: error instanceof Error ? error.message : "Tool failed",
    errorCode: "INTERNAL_ERROR",
    customerMessage: strings.aiUnavailable,
  };
}

async function resolveCartId(context: ToolContext): Promise<string> {
  const cart = await ensureCart({
    tenantId: context.tenantId,
    conversationId: context.conversationId,
    channel: context.channel,
    customerReference: context.customerReference,
  });
  return cart.cartId;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

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
      const haystack = [
        d.name,
        d.description,
        d.categoryId,
        ...(Array.isArray(d.aliases) ? (d.aliases as string[]) : []),
      ]
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

/** Adds, removes or changes items in the customer's active cart. */
async function runUpdateCart(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolOutcome> {
  const cartId = context.cartId ?? (await resolveCartId(context));
  const operationRaw = String(args.operation ?? "add");
  const operation = (["add", "remove", "set", "clear"] as const).includes(
    operationRaw as "add" | "remove" | "set" | "clear"
  )
    ? (operationRaw as "add" | "remove" | "set" | "clear")
    : "add";

  const rawItems = Array.isArray(args.items) ? args.items : [];
  const items = rawItems.map((entry) => {
    const item = entry as { itemId?: unknown; quantity?: unknown };
    return {
      itemId: String(item.itemId ?? ""),
      quantity: Number(item.quantity ?? 0),
    };
  });

  try {
    const cart = await updateCart({
      tenantId: context.tenantId,
      cartId,
      operation,
      items,
      fulfilmentType:
        args.fulfilmentType === "pickup"
          ? "pickup"
          : args.fulfilmentType === "delivery"
            ? "delivery"
            : undefined,
      address: typeof args.address === "string" ? args.address : undefined,
      customerName:
        typeof args.customerName === "string" ? args.customerName : undefined,
      customerPhone:
        typeof args.customerPhone === "string" ? args.customerPhone : undefined,
      notes: typeof args.notes === "string" ? args.notes : undefined,
      currency: context.currency,
    });

    const lines = cart.items.map((line) => `${line.quantity}x ${line.name}`);

    return {
      ok: true,
      data: {
        cartId: cart.cartId,
        revision: cart.cartRevision,
        items: lines,
        summary: describeCart(cart),
        status: cart.status,
        note: "The previous quote is now invalid. Call quote_order again before confirming.",
      },
    };
  } catch (error: unknown) {
    return cartFailure(context, error);
  }
}

/** Prices the active cart without placing the order. */
async function runQuoteOrder(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolOutcome> {
  const cartId =
    (typeof args.cartId === "string" && args.cartId) ||
    context.cartId ||
    (await resolveCartId(context));

  try {
    const { cart, quote } = await quoteCart({
      tenantId: context.tenantId,
      cartId,
      currency: context.currency,
    });

    return {
      ok: true,
      data: {
        cartId: cart.cartId,
        revision: quote.revision,
        quoteId: quote.quoteId,
        totalLabel: quote.totalLabel,
        subtotalLabel: quote.subtotalLabel,
        discountLabel: quote.discountLabel,
        deliveryFeeLabel: quote.deliveryFeeLabel,
        appliedOffer: quote.appliedOffer,
        minimumOrderLabel: quote.minimumOrderLabel,
        deliveryAreaStatus: quote.deliveryAreaStatus,
        lines: cart.items.map(
          (line) =>
            `${line.quantity}x ${line.name} — ${context.currency} ${(
              line.lineTotalMinor / 100
            ).toFixed(0)}`
        ),
        nextStep:
          "Show the customer this total and ask them to confirm before calling create_order.",
      },
    };
  } catch (error: unknown) {
    return cartFailure(context, error);
  }
}

/** Places the order from the active cart (requires a fresh quote). */
async function runCreateOrder(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolOutcome> {
  const cartId =
    (typeof args.cartId === "string" && args.cartId) ||
    context.cartId ||
    (await resolveCartId(context));

  try {
    const result = await submitCart({
      tenantId: context.tenantId,
      cartId,
      channel: context.channel,
      currency: context.currency,
      customerName:
        typeof args.customerName === "string" ? args.customerName : undefined,
      customerPhone:
        typeof args.customerPhone === "string" ? args.customerPhone : undefined,
      address: typeof args.address === "string" ? args.address : undefined,
      notes: typeof args.notes === "string" ? args.notes : undefined,
    });

    const money = (minor: number) =>
      `${context.currency} ${(minor / 100).toFixed(0)}`;

    return {
      ok: true,
      data: {
        orderNumber: result.orderNumber,
        orderId: result.orderId,
        totalLabel: result.totalLabel,
        subtotalLabel: money(result.pricing.subtotalMinor),
        discountLabel: money(result.pricing.discountMinor),
        deliveryFeeLabel: money(result.pricing.deliveryFeeMinor),
        totalMinor: result.pricing.totalMinor,
        duplicate: result.duplicate,
      },
    };
  } catch (error: unknown) {
    return cartFailure(context, error);
  }
}

/** Returns the status of a previously placed order. */
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
        (sum: number, item: { quantity?: number }) =>
          sum + Number(item.quantity ?? 0),
        0
      ),
    },
  };
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
    case "update_cart":
      return runUpdateCart(args, context);
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

export { createHash };
