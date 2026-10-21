import { tenantCollection } from "@/lib/tenancy/resolver";

/**
 * Recommendations (Phase 5 of the blueprint).
 *
 * Rules:
 * - every suggestion is a published, currently available tenant item;
 * - budget bounds are respected when the data allows it;
 * - add-ons are optional and limited (the assistant must offer at most one);
 * - popularity comes from real completed orders, not guesses.
 */

export interface PopularItem {
  itemId: string;
  name: string;
  quantitySold: number;
  revenueMinor: number;
}

export interface Recommendation {
  itemId: string;
  name: string;
  description: string;
  priceLabel: string;
  priceMinor: number;
  reason: string;
  kind: "popular" | "add_on" | "complement" | "repeat";
}

export interface OrderLine {
  itemId?: string;
  name?: string;
  quantity?: number;
  unitPriceMinor?: number;
  lineTotalMinor?: number;
}

/** Aggregates what customers actually order (completed orders only). */
export async function aggregatePopularItems(
  tenantId: string,
  limit = 10
): Promise<PopularItem[]> {
  const snap = await tenantCollection(tenantId, "orders")
    .where("status", "==", "completed")
    .limit(500)
    .get();

  const counts = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const doc of snap.docs) {
    const data = doc.data();
    for (const line of (data.items ?? []) as OrderLine[]) {
      const itemId = String(line.itemId ?? "");
      if (!itemId) continue;
      const quantity = Number(line.quantity ?? 0);
      const entry = counts.get(itemId) ?? {
        name: String(line.name ?? itemId),
        quantity: 0,
        revenue: 0,
      };
      entry.name = String(line.name ?? entry.name);
      entry.quantity += quantity;
      entry.revenue += Number(line.lineTotalMinor ?? 0);
      counts.set(itemId, entry);
    }
  }

  return Array.from(counts.entries())
    .map(([itemId, value]) => ({
      itemId,
      name: value.name,
      quantitySold: value.quantity,
      revenueMinor: value.revenue,
    }))
    .sort((a, b) => b.quantitySold - a.quantitySold || b.revenueMinor - a.revenueMinor)
    .slice(0, limit);
}

/**
 * Builds recommendations for the current cart.
 * `budgetMinor` caps the total recommended spend; items that do not fit are
 * dropped, and the list always stays inside published/available items.
 */
export async function buildRecommendations(input: {
  tenantId: string;
  currency: string;
  cartItemIds?: string[];
  budgetMinor?: number | null;
  limit?: number;
}): Promise<{ recommendations: Recommendation[]; popular: PopularItem[] }> {
  const limit = Math.min(input.limit ?? 5, 10);
  const cartItemIds = new Set(input.cartItemIds ?? []);

  const [itemsSnap, popular] = await Promise.all([
    tenantCollection(input.tenantId, "menuItems")
      .where("publicationStatus", "==", "published")
      .get(),
    aggregatePopularItems(input.tenantId),
  ]);

  const published = itemsSnap.docs
    .map((doc) => {
      const d = doc.data();
      return {
        itemId: String(d.itemId || doc.id),
        name: String(d.name ?? ""),
        description: String(d.description ?? ""),
        priceMinor: Number(d.basePriceMinor ?? 0),
        available: d.availability === "available",
        categoryId: String(d.categoryId ?? ""),
      };
    })
    .filter((item) => item.available && item.priceMinor > 0);

  const popularById = new Map(popular.map((item) => [item.itemId, item]));
  const cartCategories = new Set(
    published
      .filter((item) => cartItemIds.has(item.itemId))
      .map((item) => item.categoryId)
  );

  const scored = published
    .filter((item) => !cartItemIds.has(item.itemId))
    .map((item) => {
      const sold = popularById.get(item.itemId);
      const popularScore = sold ? sold.quantitySold * 10 : 0;
      const complementScore = cartCategories.size > 0 && !cartCategories.has(item.categoryId) ? 3 : 0;
      return { item, score: popularScore + complementScore, sold };
    })
    .sort((a, b) => b.score - a.score);

  const recommendations: Recommendation[] = [];
  let runningTotal = 0;

  for (const entry of scored) {
    if (recommendations.length >= limit) break;
    const priceMinor = entry.item.priceMinor;

    if (input.budgetMinor && input.budgetMinor > 0) {
      // Budget bound: skip items that would exceed the remaining budget.
      if (runningTotal + priceMinor > input.budgetMinor) continue;
    }

    const kind: Recommendation["kind"] = entry.sold
      ? "popular"
      : cartCategories.size > 0 && !cartCategories.has(entry.item.categoryId)
        ? "complement"
        : "add_on";

    recommendations.push({
      itemId: entry.item.itemId,
      name: entry.item.name,
      description: entry.item.description,
      priceLabel: `${input.currency} ${(priceMinor / 100).toFixed(0)}`,
      priceMinor,
      reason: entry.sold
        ? `frequently ordered (${entry.sold.quantitySold} times)`
        : "goes well with the items in the cart",
      kind,
    });
    runningTotal += priceMinor;
  }

  return { recommendations, popular };
}

/** The customer's last completed order, for a repeat-order shortcut. */
export async function lastCompletedOrder(
  tenantId: string,
  customerPhone: string
): Promise<{ orderNumber: string; lines: OrderLine[]; totalMinor: number } | null> {
  const phone = String(customerPhone ?? "").replace(/\D/g, "");
  if (!phone) return null;

  const snap = await tenantCollection(tenantId, "orders")
    .where("status", "==", "completed")
    .limit(50)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();
    const orderPhone = String(data.customer?.phone ?? "").replace(/\D/g, "");
    if (orderPhone && orderPhone === phone) {
      return {
        orderNumber: String(data.orderNumber ?? ""),
        lines: (data.items ?? []) as OrderLine[],
        totalMinor: Number(data.totalMinor ?? 0),
      };
    }
  }
  return null;
}

/**
 * Measures recommendation acceptance: how often a recommended item ended up in
 * the order that followed the recommendation.
 */
export async function measureRecommendationAcceptance(
  tenantId: string
): Promise<{ recommended: number; accepted: number; rate: number }> {
  const snap = await tenantCollection(tenantId, "orders")
    .where("attribution.recommendedItemIds", "==", null)
    .get()
    .catch(() => null);

  // Simpler and index-safe: scan recent orders and use the stored attribution.
  const recent = await tenantCollection(tenantId, "orders")
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();

  let recommended = 0;
  let accepted = 0;
  for (const doc of recent.docs) {
    const data = doc.data();
    const attribution = (data.attribution ?? {}) as { recommendedItemIds?: string[] };
    const ids = Array.isArray(attribution.recommendedItemIds)
      ? attribution.recommendedItemIds
      : [];
    if (ids.length === 0) continue;
    recommended += ids.length;
    const orderedIds = new Set(
      ((data.items ?? []) as OrderLine[]).map((line) => String(line.itemId ?? ""))
    );
    for (const id of ids) {
      if (orderedIds.has(id)) accepted += 1;
    }
  }
  void snap;

  return {
    recommended,
    accepted,
    rate: recommended > 0 ? Math.round((accepted / recommended) * 100) : 0,
  };
}
