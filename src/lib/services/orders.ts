import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";
import { randomBytes } from "crypto";

export interface OrderItemInput {
  itemId: string;
  quantity: number;
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
}

export interface PricingResult {
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  appliedOfferName: string | null;
}

const PAGE_ONLY_STATUSES = ["received", "confirmed", "preparing", "ready", "dispatched", "completed", "declined", "cancelled"] as const;
export type OrderStatus = (typeof PAGE_ONLY_STATUSES)[number];

function quantityIsValid(qty: number): boolean {
  return Number.isInteger(qty) && qty >= 1 && qty <= 20;
}

async function loadEligibleOffer(
  tenantId: string,
  lineItems: Array<{ itemId: string; categoryId: string; unitPriceMinor: number; quantity: number }>,
  subtotalMinor: number
): Promise<{
  offerId: string;
  name: string;
  discountMinor: number;
} | null> {
  const snap = await tenantCollection(tenantId, "offers")
    .where("status", "==", "active")
    .get();

  const now = Date.now();
  let best: { offerId: string; name: string; discountMinor: number } | null = null;

  for (const doc of snap.docs) {
    const d = doc.data();
    const start = d.startAt ? new Date(d.startAt as Date).getTime() : 0;
    const end = d.endAt ? new Date(d.endAt as Date).getTime() : 0;
    if (start && start > now) continue;
    if (end && end < now) continue;

    // Scoped offers (category / item scoped) only apply to the matching lines
    // and the discount is calculated on the scoped subtotal.
    const scopeCategoryIds: string[] = Array.isArray(d.scopeCategoryIds)
      ? d.scopeCategoryIds
      : [];
    const scopeItemIds: string[] = Array.isArray(d.scopeItemIds)
      ? d.scopeItemIds
      : [];

    const isScoped = scopeCategoryIds.length > 0 || scopeItemIds.length > 0;
    const eligibleLines = isScoped
      ? lineItems.filter(
          (line) =>
            (scopeCategoryIds.length === 0 ||
              scopeCategoryIds.includes(line.categoryId)) &&
            (scopeItemIds.length === 0 || scopeItemIds.includes(line.itemId))
        )
      : lineItems;

    if (isScoped && eligibleLines.length === 0) continue;

    const scopedSubtotal = eligibleLines.reduce(
      (sum, line) => sum + line.unitPriceMinor * line.quantity,
      0
    );
    const baseSubtotal = isScoped ? scopedSubtotal : subtotalMinor;

    const minOrder = Number(d.minOrderMinor ?? 0);
    if (minOrder && baseSubtotal < minOrder) continue;

    let discount = 0;
    if (d.type === "percentage") {
      discount = Math.round((baseSubtotal * Number(d.valuePct ?? 0)) / 100);
    } else if (d.type === "fixedDiscount") {
      discount = Math.min(Number(d.valueMinor ?? 0), baseSubtotal);
    } else if (d.type === "freeDelivery") {
      // handled by the delivery fee waiver in createOrder
      discount = 0;
    }

    if (discount > (best?.discountMinor ?? 0)) {
      best = { offerId: d.offerId || doc.id, name: d.name, discountMinor: discount };
    }
  }

  return best;
}

async function loadFreeDeliveryOffer(
  tenantId: string,
  lineItems: Array<{ itemId: string; categoryId: string; unitPriceMinor: number; quantity: number }>,
  subtotalMinor: number
): Promise<{ offerId: string; name: string } | null> {
  const snap = await tenantCollection(tenantId, "offers")
    .where("status", "==", "active")
    .get();

  const now = Date.now();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.type !== "freeDelivery") continue;
    const start = d.startAt ? new Date(d.startAt as Date).getTime() : 0;
    const end = d.endAt ? new Date(d.endAt as Date).getTime() : 0;
    if (start && start > now) continue;
    if (end && end < now) continue;

    const scopeCategoryIds: string[] = Array.isArray(d.scopeCategoryIds)
      ? d.scopeCategoryIds
      : [];
    const scopeItemIds: string[] = Array.isArray(d.scopeItemIds)
      ? d.scopeItemIds
      : [];
    const isScoped = scopeCategoryIds.length > 0 || scopeItemIds.length > 0;
    const eligibleLines = isScoped
      ? lineItems.filter(
          (line) =>
            (scopeCategoryIds.length === 0 ||
              scopeCategoryIds.includes(line.categoryId)) &&
            (scopeItemIds.length === 0 || scopeItemIds.includes(line.itemId))
        )
      : lineItems;
    if (isScoped && eligibleLines.length === 0) continue;

    const baseSubtotal = eligibleLines.reduce(
      (sum, line) => sum + line.unitPriceMinor * line.quantity,
      0
    );
    const minOrder = Number(d.minOrderMinor ?? 0);
    if (minOrder && baseSubtotal < minOrder) continue;

    return { offerId: d.offerId || doc.id, name: d.name };
  }

  return null;
}

export async function createOrder(input: CreateOrderInput): Promise<{
  orderId: string;
  orderNumber: string;
  pricing: PricingResult;
  duplicate: boolean;
}> {
  if (!input.tenantId) throw new Error("Missing tenant");
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 20) {
    throw new Error("Invalid order items");
  }
  for (const item of input.items) {
    if (!quantityIsValid(item.quantity)) {
      throw new Error("Invalid quantity");
    }
    if (!item.itemId || item.itemId.length > 64) {
      throw new Error("Invalid item id");
    }
  }
  if (typeof input.customerName !== "string" || !input.customerName.trim() || input.customerName.length > 100) {
    throw new Error("Invalid customer name");
  }
  if (typeof input.customerPhone !== "string" || !/^[+\d][\d\s-]{6,15}$/.test(input.customerPhone)) {
    throw new Error("Invalid customer phone");
  }
  if (input.fulfilmentType === "delivery") {
    if (typeof input.address !== "string" || input.address.trim().length < 8 || input.address.length > 300) {
      throw new Error("Valid address required for delivery");
    }
  }
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(input.idempotencyKey)) {
    throw new Error("Invalid idempotency key");
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
  };

  const snapshots: Array<Record<string, unknown>> = [];
  const lineItems: Array<{
    itemId: string;
    categoryId: string;
    unitPriceMinor: number;
    quantity: number;
  }> = [];

  // Read the menu items in parallel (one round trip instead of N).
  const itemSnaps = await Promise.all(
    input.items.map((entry) =>
      tenantDoc(input.tenantId, "menuItems", entry.itemId).get()
    )
  );

  for (let index = 0; index < itemSnaps.length; index++) {
    const itemSnap = itemSnaps[index];
    const entry = input.items[index];
    if (!itemSnap.exists) throw new Error("Menu item not found");
    const d = itemSnap.data()!;
    if (d.publicationStatus !== "published") {
      throw new Error("Menu item not available");
    }
    if (d.availability !== "available") {
      throw new Error(`${d.name} is currently unavailable`);
    }
    const unitPriceMinor = Number(d.basePriceMinor ?? 0);
    pricing.subtotalMinor += unitPriceMinor * entry.quantity;
    snapshots.push({
      itemId: entry.itemId,
      name: d.name,
      categoryId: d.categoryId ?? null,
      unitPriceMinor,
      quantity: entry.quantity,
      lineTotalMinor: unitPriceMinor * entry.quantity,
    });
    lineItems.push({
      itemId: entry.itemId,
      categoryId: String(d.categoryId ?? ""),
      unitPriceMinor,
      quantity: entry.quantity,
    });
  }

  let deliveryFeeMinor = 0;
  if (input.fulfilmentType === "delivery") {
    const settingsSnap = await tenantDoc(input.tenantId, "settings", "delivery").get();
    deliveryFeeMinor = Number(settingsSnap.data()?.deliveryFeeMinor ?? 0);
  }

  const offer = await loadEligibleOffer(
    input.tenantId,
    lineItems,
    pricing.subtotalMinor
  );
  if (offer) {
    pricing.discountMinor = offer.discountMinor;
    pricing.appliedOfferName = offer.name;
  }

  // A free-delivery offer waives the delivery fee (never the item subtotal).
  const freeDeliveryOffer = await loadFreeDeliveryOffer(
    input.tenantId,
    lineItems,
    pricing.subtotalMinor
  );
  if (freeDeliveryOffer && input.fulfilmentType === "delivery") {
    pricing.deliveryFeeMinor = 0;
    pricing.appliedOfferName = pricing.appliedOfferName ?? freeDeliveryOffer.name;
  } else {
    pricing.deliveryFeeMinor = deliveryFeeMinor;
  }

  pricing.totalMinor = Math.max(
    pricing.subtotalMinor - pricing.discountMinor + pricing.deliveryFeeMinor,
    0
  );

  const orderNumber = `TC-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${randomBytes(2).toString("hex").toUpperCase()}`;

  const currency = await getCurrency(input.tenantId);

  await orderRef.set({
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
    currency,
    appliedOffer: pricing.appliedOfferName,
    customer: {
      name: input.customerName.trim(),
      phone: input.customerPhone,
    },
    fulfilment: {
      type: input.fulfilmentType,
      address: input.fulfilmentType === "delivery" ? input.address?.trim() : null,
    },
    notes: typeof input.notes === "string" ? input.notes.slice(0, 500) : "",
    idempotencyKey: input.idempotencyKey,
    createdBy: "storefront",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { orderId: docId, orderNumber, pricing, duplicate: false };
}

async function getCurrency(tenantId: string): Promise<string> {
  const profile = await tenantDoc(tenantId, "profile", "main").get();
  return profile.data()?.currency ?? "PKR";
}
