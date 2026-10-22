import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";
import { getAdminDb } from "@/lib/firebase/admin";
import { randomBytes } from "crypto";
import { createHash } from "crypto";
import { isFulfilmentType } from "@/lib/domain/order-status";
import {
  lineTotalMinor,
  optionGroupsOf,
  validateSelections,
  type ItemSelection,
  type ResolvedSelection,
} from "@/lib/domain/options";

export interface OrderItemInput {
  itemId: string;
  quantity: number;
  /**
   * Chosen options for this line. Only group/option ids are sent by the
   * client; names and prices are resolved from the product configuration on
   * the server.
   */
  selections?: ItemSelection[];
  /** Optional kitchen note for this line (POS order taking). */
  note?: string;
}

/**
 * Typed, machine-readable failure codes. The AI layer maps these to
 * localized customer messages; raw exception text is never shown to customers.
 */
export type OrderErrorCode =
  | "INVALID_ORDER_ITEMS"
  | "INVALID_QUANTITY"
  | "INVALID_ITEM_ID"
  | "INVALID_CUSTOMER_NAME"
  | "INVALID_CUSTOMER_PHONE"
  | "INVALID_FULFILMENT_TYPE"
  | "ADDRESS_REQUIRED"
  | "INVALID_IDEMPOTENCY_KEY"
  | "ITEM_NOT_FOUND"
  | "ITEM_UNAVAILABLE"
  | "ITEM_NOT_PUBLISHED"
  | "INVALID_OPTIONS"
  | "MIN_ORDER_NOT_MET"
  | "OUT_OF_DELIVERY_AREA"
  | "DELIVERY_AREA_UNVERIFIED"
  | "QUOTE_EXPIRED"
  | "ORDER_STATUS_UNKNOWN"
  | "INTERNAL_ERROR";

export class OrderError extends Error {
  readonly code: OrderErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: OrderErrorCode,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "OrderError";
    this.code = code;
    this.details = details;
  }
}

export interface CreateOrderInput {
  tenantId: string;
  items: OrderItemInput[];
  customerName: string;
  customerPhone: string;
  fulfilmentType: "delivery" | "pickup";
  address?: string;
  notes?: string;
  idempotencyKey: string;
  channel: string;
  /** Optional: avoids an extra read when the caller already knows it. */
  currency?: string;
  /** Quotes may be produced before the customer gives an address. */
  requireAddress?: boolean;
  /** Attribution data (which items were recommended, which customer). */
  attribution?: {
    recommendedItemIds?: string[];
    customerId?: string | null;
    cartId?: string;
  };
  /**
   * When true, the delivery-area rule is enforced against the tenant's
   * configured areas. When the tenant has no rule configured the order is
   * still accepted, but `deliveryAreaStatus` is reported as "unverified" so
   * the assistant never claims the address is eligible.
   */
  enforceDeliveryArea?: boolean;
}

export interface PricingResult {
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  appliedOfferName: string | null;
  minimumOrderMinor: number | null;
  deliveryAreaStatus: "verified" | "unverified" | "not_applicable";
  deliveryAreaLabel: string | null;
}

const PAGE_ONLY_STATUSES = ["received", "confirmed", "preparing", "ready", "dispatched", "completed", "declined", "cancelled"] as const;
export type OrderStatus = (typeof PAGE_ONLY_STATUSES)[number];

function quantityIsValid(qty: number): boolean {
  return Number.isInteger(qty) && qty >= 1 && qty <= 20;
}

type OfferData = Record<string, unknown>;

export interface QuoteLine {
  itemId: string;
  categoryId: string;
  unitPriceMinor: number;
  quantity: number;
}

/**
 * Resolves the customer's option choices for one product against the current
 * product configuration. Throws `INVALID_OPTIONS` when a choice is unknown,
 * inactive or violates the group constraints.
 */
export function resolveItemOptions(
  product: { name?: unknown; optionGroups?: unknown },
  selections: ItemSelection[] | undefined,
  itemId: string
): { unitPriceMinor: number; resolved: ResolvedSelection[] } {
  const groups = optionGroupsOf(product);
  const result = validateSelections(groups, selections);
  if (!result.ok) {
    throw new OrderError("INVALID_OPTIONS", result.error ?? "Invalid options", {
      itemId,
    });
  }
  return { unitPriceMinor: result.priceDeltaMinor, resolved: result.resolved };
}

/**
 * Pure pricing rules (exported for unit tests):
 * - scoped offers discount only the matching lines,
 * - their minimum order is checked against the scoped subtotal,
 * - free delivery waives the delivery fee only.
 */
export function computePricing(
  lines: QuoteLine[],
  offers: OfferData[],
  deliveryFeeMinor: number,
  fulfilmentType: "delivery" | "pickup"
): {
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  appliedOfferName: string | null;
  freeDeliveryOfferName: string | null;
} {
  const subtotalMinor = lines.reduce(
    (sum, line) => sum + line.unitPriceMinor * line.quantity,
    0
  );

  const offer = selectEligibleOffer(offers, lines, subtotalMinor);
  const freeDeliveryOffer = selectFreeDeliveryOffer(offers, lines, subtotalMinor);

  const discountMinor = offer?.discountMinor ?? 0;
  const appliedOfferName = offer?.name ?? null;

  // The configured delivery fee only belongs on delivery orders; a pickup
  // customer never pays for delivery. A free-delivery offer further zeroes
  // it below.
  let fee = fulfilmentType === "delivery" ? deliveryFeeMinor : 0;
  if (freeDeliveryOffer && fulfilmentType === "delivery") {
    fee = 0;
  }

  return {
    subtotalMinor,
    discountMinor,
    deliveryFeeMinor: fee,
    totalMinor: Math.max(subtotalMinor - discountMinor + fee, 0),
    appliedOfferName,
    freeDeliveryOfferName: freeDeliveryOffer?.name ?? null,
  };
}

/**
 * Pure delivery-area rule evaluation. */
export function evaluateDeliveryArea(
  address: string | undefined,
  allowedAreaKeywords: string[],
  deliveryAreaLabel: string | null
): {
  status: "verified" | "unverified" | "out_of_area" | "not_applicable";
  label: string | null;
} {
  if (!address) {
    return { status: "not_applicable", label: deliveryAreaLabel };
  }
  const keywords = allowedAreaKeywords
    .map((value) => String(value).toLowerCase().trim())
    .filter(Boolean);
  if (keywords.length === 0) {
    // No machine-checkable rule: the assistant must not claim eligibility.
    return { status: "unverified", label: deliveryAreaLabel };
  }
  const haystack = address.toLowerCase();
  const matches = keywords.some((keyword) => haystack.includes(keyword));
  return {
    status: matches ? "verified" : "out_of_area",
    label: deliveryAreaLabel,
  };
}

export interface QuoteResult {
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
    options: ResolvedSelection[];
  }>;
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  appliedOfferName: string | null;
  minimumOrderMinor: number | null;
  deliveryAreaStatus: "verified" | "unverified" | "not_applicable";
  deliveryAreaLabel: string | null;
}

/**
 * Prices a proposed order **without storing anything**. Used by the
 * quote_order tool so a customer can be shown an authoritative total before
 * the order is created.
 */
export async function quoteOrder(input: {
  tenantId: string;
  items: OrderItemInput[];
  fulfilmentType: "delivery" | "pickup";
  address?: string;
  currency?: string;
  /** Quotes may be produced before the customer gives an address. */
  requireAddress?: boolean;
  /** Attribution data (which items were recommended, which customer). */
  attribution?: {
    recommendedItemIds?: string[];
    customerId?: string | null;
    cartId?: string;
  };
}): Promise<QuoteResult> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new OrderError("INVALID_ORDER_ITEMS", "Invalid order items");
  }
  for (const item of input.items) {
    if (!quantityIsValid(item.quantity)) {
      throw new OrderError("INVALID_QUANTITY", "Invalid quantity");
    }
    if (!item.itemId || item.itemId.length > 64) {
      throw new OrderError("INVALID_ITEM_ID", "Invalid item id");
    }
  }
  if (input.fulfilmentType === "delivery" && input.requireAddress !== false) {
    if (
      typeof input.address !== "string" ||
      input.address.trim().length < 8 ||
      input.address.length > 300
    ) {
      throw new OrderError("ADDRESS_REQUIRED", "Valid address required for delivery");
    }
  }

  const [itemSnaps, deliverySettingsSnap, offersSnap] = await Promise.all([
    Promise.all(
      input.items.map((entry) =>
        tenantDoc(input.tenantId, "menuItems", entry.itemId).get()
      )
    ),
    // Read the delivery settings for every fulfilment type: the minimum
    // order value applies to pickup orders too.
    tenantDoc(input.tenantId, "settings", "delivery").get(),
    tenantCollection(input.tenantId, "offers")
      .where("status", "==", "active")
      .get(),
  ]);

  const items: QuoteResult["items"] = [];
  const lineItems: QuoteLine[] = [];

  for (let index = 0; index < itemSnaps.length; index++) {
    const itemSnap = itemSnaps[index];
    const entry = input.items[index];
    if (!itemSnap.exists) {
      throw new OrderError("ITEM_NOT_FOUND", "Menu item not found", {
        itemId: entry.itemId,
      });
    }
    const d = itemSnap.data()!;
    if (d.publicationStatus !== "published") {
      throw new OrderError("ITEM_NOT_PUBLISHED", "Menu item not available", {
        itemId: entry.itemId,
        itemName: d.name,
      });
    }
    if (d.availability !== "available") {
      throw new OrderError("ITEM_UNAVAILABLE", `${d.name} is currently unavailable`, {
        itemId: entry.itemId,
        itemName: d.name,
      });
    }
    const options = resolveItemOptions(d, entry.selections, entry.itemId);
    const basePriceMinor = Number(d.basePriceMinor ?? 0);
    const unitPriceMinor = basePriceMinor + options.unitPriceMinor;
    items.push({
      itemId: entry.itemId,
      name: String(d.name ?? ""),
      quantity: entry.quantity,
      unitPriceMinor,
      lineTotalMinor: lineTotalMinor(basePriceMinor, options.unitPriceMinor, entry.quantity),
      options: options.resolved,
    });
    lineItems.push({
      itemId: entry.itemId,
      categoryId: String(d.categoryId ?? ""),
      unitPriceMinor,
      quantity: entry.quantity,
    });
  }

  const deliverySettings = deliverySettingsSnap?.data() ?? {};
  const deliveryFeeMinor = Number(deliverySettings.deliveryFeeMinor ?? 0);
  const minimumOrderMinor = Number(deliverySettings.minimumOrderMinor ?? 0);

  const computed = computePricing(
    lineItems,
    offersSnap.docs.map((doc) => doc.data()),
    deliveryFeeMinor,
    input.fulfilmentType
  );

  if (minimumOrderMinor > 0 && computed.subtotalMinor < minimumOrderMinor) {
    throw new OrderError(
      "MIN_ORDER_NOT_MET",
      "Order is below the minimum order value",
      {
        minimumOrderMinor,
        subtotalMinor: computed.subtotalMinor,
        currency: input.currency ?? "PKR",
      }
    );
  }

  let deliveryAreaStatus: QuoteResult["deliveryAreaStatus"] = "not_applicable";
  let deliveryAreaLabel: string | null = null;
  if (input.fulfilmentType === "delivery") {
    const allowedAreas: string[] = Array.isArray(deliverySettings.allowedAreaKeywords)
      ? (deliverySettings.allowedAreaKeywords as string[])
      : [];
    const hasAddress =
      typeof input.address === "string" &&
      input.address.trim().length >= 8 &&
      input.address.length <= 300;
    const area = evaluateDeliveryArea(
      hasAddress ? input.address : undefined,
      allowedAreas,
      (deliverySettings.deliveryArea as string) || null
    );
    if (area.status === "out_of_area") {
      throw new OrderError(
        "OUT_OF_DELIVERY_AREA",
        "Address is outside the configured delivery area",
        { allowedAreas, deliveryArea: area.label }
      );
    }
    deliveryAreaStatus =
      area.status === "verified"
        ? "verified"
        : area.status === "unverified"
          ? "unverified"
          : "not_applicable";
    deliveryAreaLabel = area.label;
  }

  return {
    items,
    subtotalMinor: computed.subtotalMinor,
    discountMinor: computed.discountMinor,
    deliveryFeeMinor: computed.deliveryFeeMinor,
    totalMinor: computed.totalMinor,
    appliedOfferName:
      computed.appliedOfferName ?? computed.freeDeliveryOfferName,
    minimumOrderMinor: minimumOrderMinor > 0 ? minimumOrderMinor : null,
    deliveryAreaStatus,
    deliveryAreaLabel,
  };
}

function offerScope(d: OfferData): {
  categoryIds: string[];
  itemIds: string[];
  scoped: boolean;
} {
  const categoryIds = Array.isArray(d.scopeCategoryIds)
    ? (d.scopeCategoryIds as string[])
    : [];
  const itemIds = Array.isArray(d.scopeItemIds) ? (d.scopeItemIds as string[]) : [];
  return { categoryIds, itemIds, scoped: categoryIds.length > 0 || itemIds.length > 0 };
}

function offerIsLive(d: OfferData, now: number): boolean {
  const start = d.startAt ? new Date(d.startAt as Date).getTime() : 0;
  const end = d.endAt ? new Date(d.endAt as Date).getTime() : 0;
  if (start && start > now) return false;
  if (end && end < now) return false;
  return true;
}

function scopedSubtotal(
  d: OfferData,
  lineItems: Array<{
    itemId: string;
    categoryId: string;
    unitPriceMinor: number;
    quantity: number;
  }>
): { subtotal: number; eligible: boolean } {
  const { categoryIds, itemIds, scoped } = offerScope(d);
  if (!scoped) {
    return {
      subtotal: lineItems.reduce(
        (sum, line) => sum + line.unitPriceMinor * line.quantity,
        0
      ),
      eligible: true,
    };
  }
  const eligibleLines = lineItems.filter(
    (line) =>
      (categoryIds.length === 0 || categoryIds.includes(line.categoryId)) &&
      (itemIds.length === 0 || itemIds.includes(line.itemId))
  );
  return {
    subtotal: eligibleLines.reduce(
      (sum, line) => sum + line.unitPriceMinor * line.quantity,
      0
    ),
    eligible: eligibleLines.length > 0,
  };
}

/**
 * Picks the best discount offer for the cart.
 * Scoped offers (category/item scoped) only discount the matching lines and
 * their minimum order is checked against that scoped subtotal.
 */
function selectEligibleOffer(
  offers: OfferData[],
  lineItems: Array<{
    itemId: string;
    categoryId: string;
    unitPriceMinor: number;
    quantity: number;
  }>,
  subtotalMinor: number
): { offerId: string; name: string; discountMinor: number } | null {
  const now = Date.now();
  let best: { offerId: string; name: string; discountMinor: number } | null = null;

  for (const d of offers) {
    if (d.type === "freeDelivery") continue;
    if (!offerIsLive(d, now)) continue;

    const { subtotal: baseSubtotal, eligible } = scopedSubtotal(d, lineItems);
    if (!eligible) continue;

    const minOrder = Number(d.minOrderMinor ?? 0);
    if (minOrder && baseSubtotal < minOrder) continue;

    let discount = 0;
    if (d.type === "percentage") {
      discount = Math.round((baseSubtotal * Number(d.valuePct ?? 0)) / 100);
    } else if (d.type === "fixedDiscount") {
      discount = Math.min(Number(d.valueMinor ?? 0), baseSubtotal);
    }

    if (discount > (best?.discountMinor ?? 0)) {
      best = {
        offerId: String(d.offerId ?? ""),
        name: String(d.name ?? ""),
        discountMinor: discount,
      };
    }
  }

  return best;
}

function selectFreeDeliveryOffer(
  offers: OfferData[],
  lineItems: Array<{
    itemId: string;
    categoryId: string;
    unitPriceMinor: number;
    quantity: number;
  }>,
  subtotalMinor: number
): { offerId: string; name: string } | null {
  const now = Date.now();
  for (const d of offers) {
    if (d.type !== "freeDelivery") continue;
    if (!offerIsLive(d, now)) continue;
    const { subtotal: baseSubtotal, eligible } = scopedSubtotal(d, lineItems);
    if (!eligible) continue;
    const minOrder = Number(d.minOrderMinor ?? 0);
    if (minOrder && baseSubtotal < minOrder) continue;
    return { offerId: String(d.offerId ?? ""), name: String(d.name ?? "") };
  }
  return null;
}

export async function createOrder(input: CreateOrderInput): Promise<{
  orderId: string;
  orderNumber: string;
  pricing: PricingResult;
  duplicate: boolean;
}> {
  if (!input.tenantId) {
    throw new OrderError("INTERNAL_ERROR", "Missing tenant");
  }
  if (
    !Array.isArray(input.items) ||
    input.items.length === 0 ||
    input.items.length > 20
  ) {
    throw new OrderError("INVALID_ORDER_ITEMS", "Invalid order items");
  }
  for (const item of input.items) {
    if (!quantityIsValid(item.quantity)) {
      throw new OrderError("INVALID_QUANTITY", "Invalid quantity");
    }
    if (!item.itemId || item.itemId.length > 64) {
      throw new OrderError("INVALID_ITEM_ID", "Invalid item id");
    }
  }
  if (
    typeof input.customerName !== "string" ||
    !input.customerName.trim() ||
    input.customerName.length > 100
  ) {
    throw new OrderError("INVALID_CUSTOMER_NAME", "Invalid customer name");
  }
  if (
    typeof input.customerPhone !== "string" ||
    !/^[+\d][\d\s-]{6,15}$/.test(input.customerPhone)
  ) {
    throw new OrderError("INVALID_CUSTOMER_PHONE", "Invalid customer phone");
  }
  if (!isFulfilmentType(input.fulfilmentType)) {
    throw new OrderError(
      "INVALID_FULFILMENT_TYPE",
      "Unsupported fulfilment type"
    );
  }
  if (input.fulfilmentType === "delivery" && input.requireAddress !== false) {
    if (
      typeof input.address !== "string" ||
      input.address.trim().length < 8 ||
      input.address.length > 300
    ) {
      throw new OrderError("ADDRESS_REQUIRED", "Valid address required for delivery");
    }
  }
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(input.idempotencyKey)) {
    throw new OrderError("INVALID_IDEMPOTENCY_KEY", "Invalid idempotency key");
  }

  const docId = `o_${input.idempotencyKey}`;
  const orderRef = tenantCollection(input.tenantId, "orders").doc(docId);
  const existing = await orderRef.get();
  if (existing.exists) {
    const d = existing.data()!;
    return {
      orderId: docId,
      orderNumber: d.orderNumber,
      pricing: {
        subtotalMinor: d.subtotalMinor,
        discountMinor: d.discountMinor,
        deliveryFeeMinor: d.deliveryFeeMinor,
        totalMinor: d.totalMinor,
        appliedOfferName: d.appliedOfferName ?? null,
        minimumOrderMinor: d.minimumOrderMinor ?? null,
        deliveryAreaStatus: d.deliveryAreaStatus ?? "not_applicable",
        deliveryAreaLabel: d.deliveryAreaLabel ?? null,
      },
      duplicate: true,
    };
  }

  const pricing: PricingResult = {
    subtotalMinor: 0,
    discountMinor: 0,
    deliveryFeeMinor: 0,
    totalMinor: 0,
    appliedOfferName: null,
    minimumOrderMinor: null,
    deliveryAreaStatus: "not_applicable",
    deliveryAreaLabel: null,
  };

  const snapshots: Array<Record<string, unknown>> = [];
  const lineItems: Array<{
    itemId: string;
    categoryId: string;
    unitPriceMinor: number;
    quantity: number;
  }> = [];

  // Read the menu items, the delivery settings and the offers in parallel
  // (one round trip instead of three).
  const [itemSnaps, deliverySettingsSnap, offersSnap] = await Promise.all([
    Promise.all(
      input.items.map((entry) =>
        tenantDoc(input.tenantId, "menuItems", entry.itemId).get()
      )
    ),
    // Read the delivery settings for every fulfilment type: the minimum
    // order value applies to pickup orders too.
    tenantDoc(input.tenantId, "settings", "delivery").get(),
    tenantCollection(input.tenantId, "offers")
      .where("status", "==", "active")
      .get(),
  ]);

  for (let index = 0; index < itemSnaps.length; index++) {
    const itemSnap = itemSnaps[index];
    const entry = input.items[index];
    if (!itemSnap.exists) {
      throw new OrderError("ITEM_NOT_FOUND", "Menu item not found", {
        itemId: entry.itemId,
      });
    }
    const d = itemSnap.data()!;
    if (d.publicationStatus !== "published") {
      throw new OrderError("ITEM_NOT_PUBLISHED", "Menu item not available", {
        itemId: entry.itemId,
        itemName: d.name,
      });
    }
    if (d.availability !== "available") {
      throw new OrderError("ITEM_UNAVAILABLE", `${d.name} is currently unavailable`, {
        itemId: entry.itemId,
        itemName: d.name,
      });
    }
    const options = resolveItemOptions(d, entry.selections, entry.itemId);
    const basePriceMinor = Number(d.basePriceMinor ?? 0);
    const unitPriceMinor = basePriceMinor + options.unitPriceMinor;
    pricing.subtotalMinor += lineTotalMinor(
      basePriceMinor,
      options.unitPriceMinor,
      entry.quantity
    );
    snapshots.push({
      itemId: entry.itemId,
      name: d.name,
      categoryId: d.categoryId ?? null,
      unitPriceMinor,
      basePriceMinor,
      quantity: entry.quantity,
      lineTotalMinor: lineTotalMinor(
        basePriceMinor,
        options.unitPriceMinor,
        entry.quantity
      ),
      options: options.resolved,
      ...(entry.note ? { note: String(entry.note).slice(0, 200) } : {}),
    });
    lineItems.push({
      itemId: entry.itemId,
      categoryId: String(d.categoryId ?? ""),
      unitPriceMinor,
      quantity: entry.quantity,
    });
  }

  const deliverySettings = deliverySettingsSnap?.data() ?? {};
  const deliveryFeeMinor = Number(deliverySettings.deliveryFeeMinor ?? 0);
  const minimumOrderMinor = Number(deliverySettings.minimumOrderMinor ?? 0);
  pricing.minimumOrderMinor = minimumOrderMinor > 0 ? minimumOrderMinor : null;

  // --- Backend rule: minimum order value -------------------------------
  if (minimumOrderMinor > 0 && pricing.subtotalMinor < minimumOrderMinor) {
    throw new OrderError(
      "MIN_ORDER_NOT_MET",
      "Order is below the minimum order value",
      {
        minimumOrderMinor,
        subtotalMinor: pricing.subtotalMinor,
        currency: input.currency ?? "PKR",
      }
    );
  }

  // --- Backend rule: delivery area ------------------------------------
  if (input.fulfilmentType === "delivery") {
    const allowedAreas: string[] = Array.isArray(deliverySettings.allowedAreaKeywords)
      ? (deliverySettings.allowedAreaKeywords as string[])
      : [];
    const areaLabel = (deliverySettings.deliveryArea as string) || null;
    const area = evaluateDeliveryArea(input.address, allowedAreas, areaLabel);

    if (area.status === "out_of_area") {
      throw new OrderError(
        "OUT_OF_DELIVERY_AREA",
        "Address is outside the configured delivery area",
        { allowedAreas, deliveryArea: areaLabel }
      );
    }
    pricing.deliveryAreaStatus =
      area.status === "verified"
        ? "verified"
        : area.status === "unverified"
          ? "unverified"
          : "not_applicable";
    pricing.deliveryAreaLabel = area.label;
  }

  // --- Pricing (pure rules, unit tested) --------------------------------
  const computed = computePricing(
    lineItems,
    offersSnap.docs.map((doc) => doc.data()),
    deliveryFeeMinor,
    input.fulfilmentType
  );
  pricing.subtotalMinor = computed.subtotalMinor;
  pricing.discountMinor = computed.discountMinor;
  pricing.deliveryFeeMinor = computed.deliveryFeeMinor;
  pricing.totalMinor = computed.totalMinor;
  pricing.appliedOfferName =
    computed.appliedOfferName ?? computed.freeDeliveryOfferName;

  const currency = input.currency ?? (await getCurrency(input.tenantId));
  const orderNumber = await reserveOrderNumber(input.tenantId, currency);

  const orderDocument = {
    orderId: docId,
    tenantId: input.tenantId,
    orderNumber,
    channel: input.channel,
    status: "received" as OrderStatus,
    paymentStatus: "unpaid",
    items: snapshots,
    subtotalMinor: pricing.subtotalMinor,
    discountMinor: pricing.discountMinor,
    deliveryFeeMinor: pricing.deliveryFeeMinor,
    totalMinor: pricing.totalMinor,
    minimumOrderMinor: pricing.minimumOrderMinor,
    deliveryAreaStatus: pricing.deliveryAreaStatus,
    deliveryAreaLabel: pricing.deliveryAreaLabel,
    currency,
    appliedOffer: pricing.appliedOfferName,
    customer: {
      name: input.customerName.trim(),
      phone: input.customerPhone,
      phoneHash: hashPhone(input.customerPhone),
    },
    fulfilment: {
      type: input.fulfilmentType,
      address: input.fulfilmentType === "delivery" ? input.address?.trim() : null,
    },
    notes: typeof input.notes === "string" ? input.notes.slice(0, 500) : "",
    idempotencyKey: input.idempotencyKey,
    attribution: input.attribution ?? null,
    createdBy: "storefront",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Atomic create-if-absent: two concurrent submits with the same
  // idempotency key can only produce one logical order.
  const db = getAdminDb();
  const created = await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (snap.exists) return false;
    tx.set(orderRef, orderDocument);
    return true;
  });

  if (!created) {
    // Another request won the race - return the canonical order.
    const snap = await orderRef.get();
    const d = snap.data()!;
    return {
      orderId: docId,
      orderNumber: d.orderNumber,
      pricing: {
        subtotalMinor: d.subtotalMinor,
        discountMinor: d.discountMinor,
        deliveryFeeMinor: d.deliveryFeeMinor,
        totalMinor: d.totalMinor,
        appliedOfferName: d.appliedOfferName ?? null,
        minimumOrderMinor: d.minimumOrderMinor ?? null,
        deliveryAreaStatus: d.deliveryAreaStatus ?? "not_applicable",
        deliveryAreaLabel: d.deliveryAreaLabel ?? null,
      },
      duplicate: true,
    };
  }

  // Index document so order lookup never needs a collection scan.
  await getAdminDb()
    .collection("orderNumbers")
    .doc(orderNumber)
    .set(
      {
        orderNumber,
        tenantId: input.tenantId,
        orderId: docId,
        phoneHash: hashPhone(input.customerPhone),
        createdAt: new Date(),
      },
      { merge: true }
    );

  return { orderId: docId, orderNumber, pricing, duplicate: false };
}

/** Stable, non-reversible identifier for a phone number (index lookups). */
export function hashPhone(phone: string): string {
  return createHash("sha256")
    .update(String(phone).replace(/\D/g, ""))
    .digest("hex")
    .slice(0, 32);
}

/**
 * Reserves a collision-free, human-readable order number.
 * A top-level index document is created inside a transaction so two
 * concurrent orders can never share a number.
 */
export async function reserveOrderNumber(
  tenantId: string,
  currency: string
): Promise<string> {
  const db = getAdminDb();
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");

  for (let attempt = 0; attempt < 6; attempt++) {
    const suffix = randomBytes(4).toString("hex").toUpperCase();
    const candidate = `TC-${datePart}-${suffix}`;
    const ref = db.collection("orderNumbers").doc(candidate);

    const reserved = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return false;
      tx.set(ref, {
        orderNumber: candidate,
        tenantId,
        currency,
        createdAt: new Date(),
      });
      return true;
    });

    if (reserved) return candidate;
  }

  // Extremely unlikely fallback: a longer random suffix.
  return `TC-${datePart}-${randomBytes(8).toString("hex").toUpperCase()}`;
}

/**
 * Resolves an order by its public order number using the index (no scan).
 * Tenant scope is enforced by the caller.
 */
export async function findOrderByNumber(
  tenantId: string,
  orderNumber: string
): Promise<{ orderId: string; phoneHash: string } | null> {
  const snap = await getAdminDb()
    .collection("orderNumbers")
    .doc(orderNumber.trim().toUpperCase())
    .get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.tenantId !== tenantId) return null;
  return {
    orderId: String(data.orderId ?? ""),
    phoneHash: String(data.phoneHash ?? ""),
  };
}

async function getCurrency(tenantId: string): Promise<string> {
  const profile = await tenantDoc(tenantId, "profile", "main").get();
  return profile.data()?.currency ?? "PKR";
}
