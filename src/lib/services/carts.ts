import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";
import {
  createOrder,
  quoteOrder,
  OrderError,
  type OrderErrorCode,
  type QuoteResult,
} from "./orders";
import { createHash } from "crypto";
import {
  lineTotalMinor,
  optionGroupsOf,
  validateSelections,
  type ItemSelection,
  type ResolvedSelection,
} from "@/lib/domain/options";

/**
 * Server-side cart with an explicit revision (Phase 2 of the blueprint).
 *
 * The cart is the single record of an active order. Every change bumps
 * `cartRevision` and invalidates the previous quote, so a confirmation can
 * never refer to a stale total.
 */

export const CART_TTL_MINUTES = 45;
export const QUOTE_TTL_MINUTES = 10;

export type CartStatus =
  | "active"
  | "awaiting_confirmation"
  | "submitted"
  | "abandoned"
  | "expired";

export interface CartItem {
  itemId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  /** Chosen option ids for this line (server resolved). */
  selections: ItemSelection[];
  /** Resolved option names/prices, snapshotted for the customer view. */
  options: ResolvedSelection[];
}

/**
 * A cart line is identified by the product **and** the chosen options, so a
 * burger with extra cheese and a plain burger stay separate lines.
 */
export function cartLineKey(itemId: string, selections: ItemSelection[]): string {
  const signature = (selections ?? [])
    .map(
      (selection) =>
        `${selection.groupId}:${(selection.optionIds ?? []).slice().sort().join(",")}`
    )
    .sort()
    .join("|");
  return signature ? `${itemId}::${signature}` : itemId;
}

/** Normalises untrusted option selections coming from a client or the model. */
export function normalizeSelections(
  selections: unknown
): ItemSelection[] {
  if (!Array.isArray(selections)) return [];
  const result: ItemSelection[] = [];
  for (const entry of selections) {
    if (!entry || typeof entry !== "object") continue;
    const groupId = String((entry as ItemSelection).groupId ?? "").trim();
    if (!groupId || groupId.length > 64) continue;
    const rawOptionIds = (entry as ItemSelection).optionIds;
    const optionIds = Array.isArray(rawOptionIds)
      ? Array.from(
          new Set(
            rawOptionIds
              .map((id) => String(id ?? "").trim())
              .filter((id) => id.length > 0 && id.length <= 64)
          )
        )
      : [];
    result.push({ groupId, optionIds });
  }
  return result;
}

export interface CartQuote {
  quoteId: string;
  revision: number;
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  totalLabel: string;
  subtotalLabel: string;
  discountLabel: string;
  deliveryFeeLabel: string;
  appliedOffer: string | null;
  minimumOrderLabel: string | null;
  deliveryAreaStatus: string;
  createdAt: string;
  expiresAt: string;
}

export interface CartDocument {
  cartId: string;
  tenantId: string;
  conversationId: string;
  channel: string;
  customerReference: string;
  status: CartStatus;
  items: CartItem[];
  fulfilment: { type: "delivery" | "pickup" | null; address: string | null };
  customer: { name: string | null; phone: string | null };
  notes: string | null;
  currentQuote: CartQuote | null;
  cartRevision: number;
  lastOrderId: string | null;
  lastOrderNumber: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export type CartErrorCode =
  | OrderErrorCode
  | "CART_NOT_FOUND"
  | "QUOTE_NOT_FOUND"
  | "QUOTE_EXPIRED"
  | "QUOTE_REVISION_CHANGED"
  | "CART_ALREADY_SUBMITTED"
  | "CART_EMPTY";

export class CartError extends Error {
  readonly code: CartErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: CartErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "CartError";
    this.code = code;
    this.details = details;
  }
}

export function cartIdForConversation(conversationId: string): string {
  const safe = conversationId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  return `cart_${safe || createHash("sha256").update(conversationId).digest("hex").slice(0, 16)}`;
}

export async function getCart(
  tenantId: string,
  cartId: string
): Promise<CartDocument | null> {
  const snap = await tenantDoc(tenantId, "carts", cartId).get();
  if (!snap.exists) return null;
  return snap.data() as CartDocument;
}

/** Creates the cart if it does not exist yet (one cart per conversation). */
export async function ensureCart(input: {
  tenantId: string;
  conversationId: string;
  channel: string;
  customerReference: string;
}): Promise<CartDocument> {
  const cartId = cartIdForConversation(input.conversationId);
  const existing = await getCart(input.tenantId, cartId);
  if (existing) {
    if (existing.status === "expired" || existing.status === "abandoned") {
      // Start a fresh cart for a new attempt.
      await tenantDoc(input.tenantId, "carts", cartId).set(
        {
          status: "active",
          items: [],
          currentQuote: null,
          cartRevision: Number(existing.cartRevision ?? 0) + 1,
          lastOrderId: null,
          lastOrderNumber: null,
          idempotencyKey: null,
          updatedAt: new Date(),
          expiresAt: new Date(Date.now() + CART_TTL_MINUTES * 60_000),
        },
        { merge: true }
      );
    }
    return (await getCart(input.tenantId, cartId))!;
  }

  const now = new Date();
  await tenantDoc(input.tenantId, "carts", cartId).set({
    cartId,
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    channel: input.channel,
    customerReference: input.customerReference,
    status: "active",
    items: [],
    fulfilment: { type: null, address: null },
    customer: { name: null, phone: null },
    notes: null,
    currentQuote: null,
    cartRevision: 1,
    lastOrderId: null,
    lastOrderNumber: null,
    idempotencyKey: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + CART_TTL_MINUTES * 60_000),
  });

  return (await getCart(input.tenantId, cartId))!;
}

function mergeItems(
  current: CartItem[],
  incoming: Array<{
    itemId: string;
    quantity: number;
    selections?: ItemSelection[];
  }>,
  operation: "add" | "set" | "remove"
): CartItem[] {
  const lines = new Map<string, CartItem>();
  for (const line of current) {
    lines.set(cartLineKey(line.itemId, line.selections), { ...line });
  }

  for (const entry of incoming) {
    const selections = entry.selections ?? [];
    const key = cartLineKey(entry.itemId, selections);
    const existing = lines.get(key);
    if (operation === "remove") {
      if (!existing) continue;
      const nextQuantity = existing.quantity - entry.quantity;
      if (nextQuantity <= 0) lines.delete(key);
      else lines.set(key, { ...existing, quantity: nextQuantity });
      continue;
    }
    if (operation === "set") {
      if (entry.quantity <= 0) lines.delete(key);
      else {
        lines.set(key, {
          ...(existing ?? {
            itemId: entry.itemId,
            name: entry.itemId,
            unitPriceMinor: 0,
            lineTotalMinor: 0,
            selections,
            options: [],
          }),
          quantity: entry.quantity,
        });
      }
      continue;
    }
    // add
    const quantity = (existing?.quantity ?? 0) + entry.quantity;
    lines.set(key, {
      ...(existing ?? {
        itemId: entry.itemId,
        name: entry.itemId,
        unitPriceMinor: 0,
        lineTotalMinor: 0,
        selections,
        options: [],
      }),
      quantity,
    });
  }

  return Array.from(lines.values());
}

/**
 * Applies a cart change. Any change increments the revision and drops the
 * current quote, so an old total can never be used for confirmation.
 */
export async function updateCart(input: {
  tenantId: string;
  cartId: string;
  operation: "add" | "remove" | "set" | "clear";
  items?: Array<{
    itemId: string;
    quantity: number;
    selections?: ItemSelection[];
  }>;
  fulfilmentType?: "delivery" | "pickup";
  address?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  currency?: string;
}): Promise<CartDocument> {
  const cart = await getCart(input.tenantId, input.cartId);
  if (!cart) throw new CartError("CART_NOT_FOUND", "Cart not found");
  if (cart.status === "submitted") {
    throw new CartError(
      "CART_ALREADY_SUBMITTED",
      "This order was already submitted",
      { orderNumber: cart.lastOrderNumber }
    );
  }

  let items = cart.items ?? [];
  if (input.operation === "clear") {
    items = [];
  } else if (input.items && input.items.length > 0) {
    const normalized = input.items.map((entry) => ({
      itemId: String(entry.itemId ?? ""),
      quantity: Math.trunc(Number(entry.quantity ?? 0)),
      selections: normalizeSelections(entry.selections),
    }));
    for (const entry of normalized) {
      if (!entry.itemId) {
        throw new CartError("INVALID_ITEM_ID", "Invalid item id");
      }
      if (entry.quantity < 0 || entry.quantity > 20) {
        throw new CartError("INVALID_QUANTITY", "Invalid quantity");
      }
    }
    items = mergeItems(items, normalized, input.operation);
  }

  // Refresh names and prices from the live menu (server is authoritative).
  const priced: CartItem[] = [];
  for (const line of items) {
    const itemSnap = await tenantDoc(input.tenantId, "menuItems", line.itemId).get();
    if (!itemSnap.exists) {
      throw new CartError("ITEM_NOT_FOUND", "Menu item not found", {
        itemId: line.itemId,
      });
    }
    const data = itemSnap.data()!;
    if (data.publicationStatus !== "published") {
      throw new CartError("ITEM_NOT_PUBLISHED", "Menu item not available", {
        itemId: line.itemId,
        itemName: data.name,
      });
    }
    if (data.availability !== "available") {
      throw new CartError("ITEM_UNAVAILABLE", `${data.name} is currently unavailable`, {
        itemId: line.itemId,
        itemName: data.name,
      });
    }
    const basePriceMinor = Number(data.basePriceMinor ?? 0);
    const validation = validateSelections(
      optionGroupsOf(data),
      line.selections ?? []
    );
    if (!validation.ok) {
      throw new CartError("INVALID_OPTIONS", validation.error ?? "Invalid options", {
        itemId: line.itemId,
        itemName: data.name,
      });
    }
    const unitPriceMinor = basePriceMinor + validation.priceDeltaMinor;
    priced.push({
      itemId: line.itemId,
      name: String(data.name ?? line.itemId),
      quantity: line.quantity,
      unitPriceMinor,
      lineTotalMinor: lineTotalMinor(
        basePriceMinor,
        validation.priceDeltaMinor,
        line.quantity
      ),
      selections: line.selections ?? [],
      options: validation.resolved,
    });
  }

  const fulfilment = {
    type: input.fulfilmentType ?? cart.fulfilment?.type ?? null,
    address:
      input.address !== undefined
        ? input.address.trim() || null
        : cart.fulfilment?.address ?? null,
  };

  const customer = {
    name:
      input.customerName !== undefined
        ? input.customerName.trim() || null
        : cart.customer?.name ?? null,
    phone:
      input.customerPhone !== undefined
        ? input.customerPhone.replace(/[^\d]/g, "") || null
        : cart.customer?.phone ?? null,
  };

  const now = new Date();
  await tenantDoc(input.tenantId, "carts", input.cartId).set(
    {
      items: priced,
      fulfilment,
      customer,
      notes: input.notes !== undefined ? input.notes.slice(0, 500) : cart.notes ?? null,
      // Any change invalidates the previous quote.
      currentQuote: null,
      cartRevision: Number(cart.cartRevision ?? 0) + 1,
      status: "active",
      updatedAt: now,
      expiresAt: new Date(now.getTime() + CART_TTL_MINUTES * 60_000),
    },
    { merge: true }
  );

  return (await getCart(input.tenantId, input.cartId))!;
}

/** Produces an authoritative quote for the current cart revision. */
export async function quoteCart(input: {
  tenantId: string;
  cartId: string;
  currency: string;
}): Promise<{ cart: CartDocument; quote: CartQuote }> {
  const cart = await getCart(input.tenantId, input.cartId);
  if (!cart) throw new CartError("CART_NOT_FOUND", "Cart not found");
  if (cart.status === "submitted") {
    throw new CartError(
      "CART_ALREADY_SUBMITTED",
      "This order was already submitted",
      { orderNumber: cart.lastOrderNumber }
    );
  }
  if (!cart.items || cart.items.length === 0) {
    throw new CartError("CART_EMPTY", "The cart is empty");
  }

  const fulfilmentType = cart.fulfilment?.type ?? "delivery";
  const quote = await quoteOrder({
    tenantId: input.tenantId,
    items: cart.items.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      selections: line.selections ?? [],
    })),
    fulfilmentType,
    address: fulfilmentType === "delivery" ? (cart.fulfilment?.address ?? undefined) : undefined,
    currency: input.currency,
    // A quote is allowed before the address is known; the order submit still
    // requires it.
    requireAddress: false,
  });

  const money = (minor: number) => `${input.currency} ${(minor / 100).toFixed(0)}`;
  const now = new Date();
  const cartQuote: CartQuote = {
    quoteId: `q_${cart.cartRevision}_${createHash("sha256")
      .update(`${cart.cartId}:${cart.cartRevision}:${quote.totalMinor}`)
      .digest("hex")
      .slice(0, 12)}`,
    revision: Number(cart.cartRevision ?? 0),
    subtotalMinor: quote.subtotalMinor,
    discountMinor: quote.discountMinor,
    deliveryFeeMinor: quote.deliveryFeeMinor,
    totalMinor: quote.totalMinor,
    totalLabel: money(quote.totalMinor),
    subtotalLabel: money(quote.subtotalMinor),
    discountLabel: money(quote.discountMinor),
    deliveryFeeLabel: money(quote.deliveryFeeMinor),
    appliedOffer: quote.appliedOfferName,
    minimumOrderLabel: quote.minimumOrderMinor
      ? money(quote.minimumOrderMinor)
      : null,
    deliveryAreaStatus: quote.deliveryAreaStatus,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + QUOTE_TTL_MINUTES * 60_000).toISOString(),
  };

  await tenantDoc(input.tenantId, "carts", input.cartId).set(
    {
      currentQuote: cartQuote,
      status: "awaiting_confirmation",
      updatedAt: now,
      expiresAt: new Date(now.getTime() + CART_TTL_MINUTES * 60_000),
    },
    { merge: true }
  );

  return { cart: (await getCart(input.tenantId, input.cartId))!, quote: cartQuote };
}

/**
 * Submits the cart as an order.
 *
 * - Requires a fresh quote for the CURRENT cart revision.
 * - Re-prices and re-validates availability at submit time.
 * - Uses a deterministic idempotency key per cart revision, so a retry after an
 *   uncertain timeout can never create a second order.
 */
export async function submitCart(input: {
  tenantId: string;
  cartId: string;
  channel: string;
  currency: string;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  notes?: string;
  /** Item ids the assistant recommended in this turn (for attribution). */
  recommendedItemIds?: string[];
  customerId?: string | null;
}): Promise<{
  orderId: string;
  orderNumber: string;
  totalLabel: string;
  duplicate: boolean;
  pricing: {
    subtotalMinor: number;
    discountMinor: number;
    deliveryFeeMinor: number;
    totalMinor: number;
  };
}> {
  const cart = await getCart(input.tenantId, input.cartId);
  if (!cart) throw new CartError("CART_NOT_FOUND", "Cart not found");

  if (cart.status === "submitted" && cart.lastOrderId && cart.lastOrderNumber) {
    // Already submitted: return the same order (idempotent).
    return {
      orderId: cart.lastOrderId,
      orderNumber: cart.lastOrderNumber,
      totalLabel: cart.currentQuote?.totalLabel ?? "",
      duplicate: true,
      pricing: {
        subtotalMinor: cart.currentQuote?.subtotalMinor ?? 0,
        discountMinor: cart.currentQuote?.discountMinor ?? 0,
        deliveryFeeMinor: cart.currentQuote?.deliveryFeeMinor ?? 0,
        totalMinor: cart.currentQuote?.totalMinor ?? 0,
      },
    };
  }

  if (!cart.items || cart.items.length === 0) {
    throw new CartError("CART_EMPTY", "The cart is empty");
  }

  const quote = cart.currentQuote;
  if (!quote) {
    throw new CartError("QUOTE_NOT_FOUND", "Quote the cart before ordering");
  }
  if (quote.revision !== Number(cart.cartRevision ?? 0)) {
    throw new CartError(
      "QUOTE_REVISION_CHANGED",
      "The cart changed after the quote was created",
      { revision: cart.cartRevision, quoteRevision: quote.revision }
    );
  }
  if (new Date(quote.expiresAt).getTime() <= Date.now()) {
    throw new CartError("QUOTE_EXPIRED", "The quote expired");
  }

  const customerName = input.customerName ?? cart.customer?.name ?? "";
  const customerPhone = input.customerPhone ?? cart.customer?.phone ?? "";
  const fulfilmentType = cart.fulfilment?.type ?? "delivery";
  const address = input.address ?? cart.fulfilment?.address ?? undefined;

  // Deterministic key: same cart revision always maps to the same order.
  const idempotencyKey = `cart_${cart.cartId}_${cart.cartRevision}`.replace(
    /[^A-Za-z0-9_-]/g,
    ""
  ).slice(0, 60);

  try {
    const result = await createOrder({
      tenantId: input.tenantId,
      items: cart.items.map((line) => ({
        itemId: line.itemId,
        quantity: line.quantity,
        selections: line.selections ?? [],
      })),
      customerName,
      customerPhone,
      fulfilmentType,
      address: fulfilmentType === "delivery" ? address : undefined,
      notes: input.notes ?? cart.notes ?? undefined,
      idempotencyKey,
      channel: input.channel,
      currency: input.currency,
      attribution: {
        recommendedItemIds: input.recommendedItemIds ?? [],
        customerId: input.customerId ?? null,
        cartId: input.cartId,
      },
    });

    await tenantDoc(input.tenantId, "carts", input.cartId).set(
      {
        status: "submitted",
        lastOrderId: result.orderId,
        lastOrderNumber: result.orderNumber,
        idempotencyKey,
        currentQuote: {
          ...(cart.currentQuote ?? {}),
          totalMinor: result.pricing.totalMinor,
          totalLabel: `${input.currency} ${(result.pricing.totalMinor / 100).toFixed(0)}`,
          subtotalMinor: result.pricing.subtotalMinor,
          discountMinor: result.pricing.discountMinor,
          deliveryFeeMinor: result.pricing.deliveryFeeMinor,
        } as CartQuote,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return {
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      totalLabel: `${input.currency} ${(result.pricing.totalMinor / 100).toFixed(0)}`,
      duplicate: result.duplicate,
      pricing: {
        subtotalMinor: result.pricing.subtotalMinor,
        discountMinor: result.pricing.discountMinor,
        deliveryFeeMinor: result.pricing.deliveryFeeMinor,
        totalMinor: result.pricing.totalMinor,
      },
    };
  } catch (error: unknown) {
    if (error instanceof OrderError) {
      throw new CartError(error.code, error.message, error.details);
    }
    throw error;
  }
}

/** Marks carts as expired/abandoned once they are past their TTL. */
export async function expireStaleCarts(tenantId: string): Promise<number> {
  const snap = await tenantCollection(tenantId, "carts")
    .where("status", "in", ["active", "awaiting_confirmation"])
    .get();
  const now = Date.now();
  let expired = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const expiresAt = data.expiresAt
      ? new Date(data.expiresAt as Date).getTime()
      : 0;
    if (expiresAt && expiresAt <= now) {
      await doc.ref.set({ status: "expired", updatedAt: new Date() }, { merge: true });
      expired += 1;
    }
  }
  return expired;
}

/** Human/AI readable cart summary used in prompts and tool results. */
export function describeCart(cart: CartDocument): string {
  if (!cart.items || cart.items.length === 0) return "Cart is empty.";
  const lines = cart.items.map(
    (line) =>
      `${line.quantity}x ${line.name}${
        line.options?.length
          ? ` [${line.options
              .map(
                (option) =>
                  `${option.groupName}: ${option.optionNames.join(", ")}`
              )
              .join("; ")}]`
          : ""
      } (${line.unitPriceMinor / 100})`
  );
  return `Cart (revision ${cart.cartRevision}): ${lines.join(", ")}`;
}
