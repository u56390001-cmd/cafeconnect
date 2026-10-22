import type {
  ItemSelection,
  ProductOptionGroup,
  ResolvedSelection,
} from "@/lib/domain/options";

/**
 * Client types for the point of sale. Prices flow through the quote API;
 * the browser only renders what the pricing engine returns.
 */

export interface PosImageReference {
  assetId?: string;
  url: string;
  altText?: string;
}

export interface PosMenuItem {
  itemId: string;
  categoryId: string;
  name: string;
  description?: string;
  basePriceMinor: number;
  availability: "available" | "soldOut" | "paused";
  publicationStatus: "draft" | "published";
  imageReferences?: PosImageReference[];
  optionGroups?: unknown;
}

export interface PosCategory {
  categoryId: string;
  name: string;
  status?: string;
  sortOrder: number;
  itemCount?: number;
}

/** One editable order line in the counter order. */
export interface PosLine {
  lineId: string;
  itemId: string;
  name: string;
  quantity: number;
  /** Sets the identity of the line: base + chosen options. */
  selections: ItemSelection[];
  note: string;
  basePriceMinor: number;
  /** Option groups of the product, used for the configure sheet. */
  optionGroups: ProductOptionGroup[];
  /** Resolved on the client only for display hints; the server re-resolves. */
  resolved?: ResolvedSelection[];
}

export interface QuoteState {
  loading: boolean;
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  appliedOfferName: string | null;
  minimumOrderMinor: number | null;
  blockedReason: string | null;
}

export const EMPTY_QUOTE: QuoteState = {
  loading: false,
  subtotalMinor: 0,
  discountMinor: 0,
  deliveryFeeMinor: 0,
  totalMinor: 0,
  appliedOfferName: null,
  minimumOrderMinor: null,
  blockedReason: null,
};

export interface PosDraftSummary {
  draftId: string;
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    selections?: ItemSelection[];
    options: ResolvedSelection[];
    note?: string;
  }>;
  customer?: { name?: string | null; phone?: string | null };
  fulfilment: { type?: "delivery" | "pickup"; address?: string | null };
  notes?: string;
  updatedAt: string;
}

/** Stable id for an order line (display only). */
let lineCounter = 0;
export function nextLineId(): string {
  lineCounter += 1;
  return `line_${Date.now().toString(36)}_${lineCounter}`;
}

/** Human text for stored option snapshots (any shape the API returns). */
export function optionText(options: unknown): string {
  if (!Array.isArray(options)) return "";
  return options
    .map((option) => {
      if (
        option &&
        typeof option === "object" &&
        typeof (option as Record<string, unknown>).groupName === "string" &&
        Array.isArray((option as Record<string, unknown>).optionNames)
      ) {
        const g = option as { groupName: string; optionNames: string[] };
        return `${g.groupName}: ${g.optionNames.join(", ")}`;
      }
      return "";
    })
    .filter(Boolean)
    .join(" · ");
}

/** Groups of a product usable right now (active groups with active options). */
export function activeOptionGroups(item: PosMenuItem): ProductOptionGroup[] {
  try {
    const groups = (item.optionGroups ?? []) as ProductOptionGroup[];
    return groups.filter(
      (group) =>
        group && group.active !== false && (group.options ?? []).some((o) => o.active !== false)
    );
  } catch {
    return [];
  }
}

/** Price deltas summed client-side for the add suggestions only; the server re-prices. */
export function displayDeltaMinor(
  groups: ProductOptionGroup[],
  selections: ItemSelection[]
): number {
  let delta = 0;
  for (const selection of selections) {
    const group = groups.find((g) => g.groupId === selection.groupId);
    if (!group) continue;
    for (const optionId of selection.optionIds) {
      const option = group.options.find((o) => o.optionId === optionId);
      if (option && option.active !== false) delta += option.priceDeltaMinor;
    }
  }
  return delta;
}

/** Resolved names for display hints before the quote responds. */
export function displayResolved(
  groups: ProductOptionGroup[],
  selections: ItemSelection[]
): ResolvedSelection[] {
  const resolved: ResolvedSelection[] = [];
  for (const selection of selections) {
    const group = groups.find((g) => g.groupId === selection.groupId);
    if (!group) continue;
    const names = selection.optionIds
      .map((optionId) => group.options.find((o) => o.optionId === optionId)?.name)
      .filter((name): name is string => Boolean(name));
    if (names.length > 0) {
      resolved.push({
        groupId: group.groupId,
        groupName: group.name,
        optionIds: selection.optionIds,
        optionNames: names,
        priceDeltaMinor: 0,
      });
    }
  }
  return resolved;
}
