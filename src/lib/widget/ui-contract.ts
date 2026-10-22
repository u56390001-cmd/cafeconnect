import { tenantDoc } from "@/lib/tenancy/resolver";
import { optionGroupsOf } from "@/lib/domain/options";

/**
 * Widget response contract (Phase 2 of the chat widget plan).
 *
 * The model never emits products, prices or images. It calls shared tools;
 * the server turns the verified tool results into typed UI blocks. Anything
 * that cannot be verified from tenant data is dropped, and the widget falls
 * back to plain text.
 */

export interface WidgetProductOption {
  optionId: string;
  name: string;
  priceDeltaMinor: number;
}

export interface WidgetProductOptionGroup {
  groupId: string;
  name: string;
  type: "single" | "multiple";
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: WidgetProductOption[];
}

export interface WidgetProduct {
  itemId: string;
  name: string;
  description: string;
  categoryName: string;
  priceMinor: number;
  priceLabel: string;
  currency: string;
  availability: string;
  imageUrl: string | null;
  imageAlt: string;
  imageWidth: number | null;
  imageHeight: number | null;
  hasOptions: boolean;
  optionGroups: WidgetProductOptionGroup[];
}

export interface WidgetCartLine {
  itemId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  options: Array<{ groupName: string; optionNames: string[] }>;
}

export interface WidgetCartSummary {
  cartId: string;
  revision: number;
  itemCount: number;
  subtotalMinor: number;
  subtotalLabel: string;
  discountMinor: number;
  discountLabel: string;
  deliveryFeeMinor: number;
  deliveryFeeLabel: string;
  totalMinor: number;
  totalLabel: string;
  appliedOffer: string | null;
  minimumOrderLabel: string | null;
  deliveryAreaStatus: string;
  lines: WidgetCartLine[];
  /** True when the total still needs an address (delivery). */
  totalIsFinal: boolean;
}

export interface WidgetOrderSummary {
  orderId: string;
  orderNumber: string;
  totalLabel: string;
  subtotalLabel: string;
  discountLabel: string;
  deliveryFeeLabel: string;
  fulfilmentType: string;
  address: string | null;
  itemCount: number;
  lines: WidgetCartLine[];
  trackUrl: string | null;
  status: string;
}

export type WidgetBlock =
  | { type: "text"; text: string }
  | { type: "quick_replies"; items: Array<{ id: string; label: string }> }
  | { type: "product_carousel"; products: WidgetProduct[] }
  | { type: "product_list"; products: WidgetProduct[] }
  | { type: "cart_summary"; cart: WidgetCartSummary }
  | { type: "order_confirmation"; order: WidgetOrderSummary }
  | { type: "notice"; tone: "info" | "warning"; text: string }
  | { type: "handoff"; text: string };

const MAX_PRODUCTS = 8;
const MAX_REPLIES = 4;
const MAX_TEXT = 600;

function money(minor: number, currency: string): string {
  return `${currency} ${Math.round(minor / 100)}`;
}

/**
 * Loads products by id **within one tenant** and returns the public card
 * payload. Missing or unpublished products are skipped - a card can never
 * expose another tenant's product or a price the model invented.
 */
export async function enrichProducts(
  tenantId: string,
  itemIds: string[],
  options: { currency: string; showImages: boolean }
): Promise<WidgetProduct[]> {
  const unique = Array.from(new Set(itemIds.filter(Boolean))).slice(0, MAX_PRODUCTS);
  if (unique.length === 0) return [];

  const docs = await Promise.all(
    unique.map((itemId) => tenantDoc(tenantId, "menuItems", itemId).get())
  );

  const products: WidgetProduct[] = [];
  for (const snap of docs) {
    if (!snap.exists) continue;
    const d = snap.data()!;
    if (d.publicationStatus !== "published") continue;

    const priceMinor = Number(d.basePriceMinor ?? 0);
    const groups = optionGroupsOf(d)
      .filter((group) => group.options.length > 0)
      .map((group) => ({
        groupId: group.groupId,
        name: group.name,
        type: group.type,
        required: group.required,
        minSelections: group.minSelections,
        maxSelections: group.maxSelections,
        options: group.options.map((option) => ({
          optionId: option.optionId,
          name: option.name,
          priceDeltaMinor: option.priceDeltaMinor,
        })),
      }));

    const image = Array.isArray(d.imageReferences)
      ? (d.imageReferences as Array<Record<string, unknown>>)[0]
      : undefined;

    products.push({
      itemId: String(d.itemId ?? snap.id),
      name: String(d.name ?? ""),
      description: String(d.description ?? ""),
      categoryName: String(d.categoryName ?? ""),
      priceMinor,
      priceLabel: money(priceMinor, options.currency),
      currency: options.currency,
      availability: String(d.availability ?? "available"),
      imageUrl:
        options.showImages && typeof image?.url === "string" ? image.url : null,
      imageAlt:
        options.showImages && typeof image?.altText === "string" && image.altText
          ? image.altText
          : String(d.name ?? ""),
      imageWidth:
        typeof image?.width === "number" ? (image.width as number) : null,
      imageHeight:
        typeof image?.height === "number" ? (image.height as number) : null,
      hasOptions: groups.length > 0,
      optionGroups: groups,
    });
  }

  return products;
}

/**
 * Validates a block list coming from the server pipeline. Unknown block types
 * and oversized payloads are dropped rather than rendered.
 */
export function parseWidgetBlocks(value: unknown): WidgetBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: WidgetBlock[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const block = raw as Record<string, unknown>;
    switch (block.type) {
      case "text": {
        const text = String(block.text ?? "").trim();
        if (text) blocks.push({ type: "text", text: text.slice(0, MAX_TEXT) });
        break;
      }
      case "quick_replies": {
        const items = Array.isArray(block.items)
          ? block.items
              .map((entry) => {
                const item = entry as { id?: unknown; label?: unknown };
                const label = String(item.label ?? "").trim();
                return {
                  id: String(item.id ?? label).slice(0, 40),
                  label: label.slice(0, 80),
                };
              })
              .filter((entry) => entry.label.length > 0)
              .slice(0, MAX_REPLIES)
          : [];
        if (items.length) blocks.push({ type: "quick_replies", items });
        break;
      }
      case "product_carousel":
      case "product_list": {
        const products = Array.isArray(block.products)
          ? (block.products as WidgetProduct[]).slice(0, MAX_PRODUCTS)
          : [];
        if (products.length === 0) break;
        blocks.push({
          type: block.type === "product_list" ? "product_list" : "product_carousel",
          products: products.map((product) => ({
            ...product,
            name: String(product.name ?? ""),
            description: String(product.description ?? ""),
            priceLabel: String(product.priceLabel ?? ""),
            priceMinor: Number(product.priceMinor ?? 0),
            imageUrl: typeof product.imageUrl === "string" ? product.imageUrl : null,
            optionGroups: Array.isArray(product.optionGroups)
              ? product.optionGroups
              : [],
            hasOptions:
              Array.isArray(product.optionGroups) && product.optionGroups.length > 0,
          })),
        });
        break;
      }
      case "cart_summary": {
        const cart = block.cart as WidgetCartSummary | undefined;
        if (!cart || typeof cart !== "object") break;
        blocks.push({ type: "cart_summary", cart });
        break;
      }
      case "order_confirmation": {
        const order = block.order as WidgetOrderSummary | undefined;
        if (!order || typeof order !== "object" || !order.orderNumber) break;
        blocks.push({ type: "order_confirmation", order });
        break;
      }
      case "notice": {
        const text = String(block.text ?? "").trim();
        if (!text) break;
        blocks.push({
          type: "notice",
          tone: block.tone === "warning" ? "warning" : "info",
          text: text.slice(0, MAX_TEXT),
        });
        break;
      }
      case "handoff": {
        const text = String(block.text ?? "").trim();
        if (!text) break;
        blocks.push({ type: "handoff", text: text.slice(0, MAX_TEXT) });
        break;
      }
      default:
        break;
    }
  }
  return blocks;
}
