import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";
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
 * Verified browse intent.
 *
 * The model can ask for product cards explicitly (show_products). As a
 * reliable fallback the server also recognises plain "show me the menu"
 * requests and resolves the matching live products itself, so the customer
 * always sees real cards instead of a wall of text.
 */
const BROWSE_WORDS = [
  "menu",
  "dikhao",
  "dikha",
  "dikhaye",
  "batao",
  "bata",
  "list",
  "show",
  "kya",
  "kya kya",
  "available",
  "options",
  "items",
  "products",
  "dishes",
];

const CATEGORY_WORDS = [
  "burger",
  "burgers",
  "pizza",
  "biryani",
  "shawarma",
  "drink",
  "drinks",
  "dessert",
  "desserts",
  "sandwich",
  "sandwiches",
  "roll",
  "rolls",
  "chaat",
  "karahi",
  "kebab",
  "fries",
  "coffee",
  "tea",
  "chawal",
  "thai",
  "deals",
  "offers",
];

export function looksLikeBrowseRequest(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (text.length === 0) return false;
  if (text.length > 160) return false;
  const hasBrowseWord = BROWSE_WORDS.some((word) =>
    text.includes(word)
  );
  const hasCategory = CATEGORY_WORDS.some((word) => text.includes(word));
  return hasCategory || hasBrowseWord;
}

/**
 * Resolves the products a browse request is about, using only live tenant
 * data (published, available, inside the tenant).
 */
export async function resolveBrowseProducts(
  tenantId: string,
  message: string,
  options: { currency: string; showImages: boolean; limit?: number }
): Promise<WidgetProduct[]> {
  const limit = Math.min(options.limit ?? 6, 8);
  const text = message.trim().toLowerCase();

  const itemsSnap = await tenantCollection(tenantId, "menuItems")
    .where("publicationStatus", "==", "published")
    .get();

  if (itemsSnap.empty) return [];

  const categoriesSnap = await tenantCollection(tenantId, "menuCategories").get();
  const categoryNames = new Map<string, string>();
  for (const doc of categoriesSnap.docs) {
    const d = doc.data();
    categoryNames.set(String(d.categoryId ?? doc.id), String(d.name ?? ""));
  }

  const rows = itemsSnap.docs.map((doc) => {
    const d = doc.data();
    const name = String(d.name ?? "");
    const categoryId = String(d.categoryId ?? "");
    const categoryName = categoryNames.get(categoryId) ?? "";
    const haystack = [
      name,
      String(d.description ?? ""),
      categoryName,
      ...(Array.isArray(d.aliases) ? (d.aliases as string[]) : []),
    ]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLowerCase();
    return { doc, d, name, categoryName, haystack };
  });

  const wantsWholeMenu =
    text.includes("menu") || text.includes("kya kya") || text.includes("list");

  let selected = rows;

  if (!wantsWholeMenu) {
    const mentioned = rows.filter(
      (row) =>
        (row.categoryName &&
          text.includes(row.categoryName.toLowerCase())) ||
        (row.name.length > 3 && text.includes(row.name.toLowerCase()))
    );
    if (mentioned.length > 0) selected = mentioned;
  }

  if (wantsWholeMenu || selected.length === 0) {
    // Whole menu: show the first published items in menu order.
    selected = rows
      .slice()
      .sort((a, b) => {
        const aOrder = Number(a.d.sortOrder ?? 0);
        const bOrder = Number(b.d.sortOrder ?? 0);
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      });
  }

  const products = await enrichProducts(
    tenantId,
    selected.slice(0, limit).map((row) => String(row.d.itemId ?? row.doc.id)),
    options
  );

  return products.filter(
    (product) => product.availability === "available" || product.priceMinor > 0
  );
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
