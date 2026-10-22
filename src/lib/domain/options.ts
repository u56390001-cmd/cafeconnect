/**
 * Product options (modifiers/variants) - Phase 5 of the Pakistan UX plan.
 *
 * A restaurant configures option groups on a product (size, add-ons, spice).
 * The customer picks options; the **server** resolves the names, prices and
 * constraints from the product configuration. Client supplied labels or prices
 * are never trusted, and the resolved choices are snapshotted into the order so
 * a later menu edit never changes a historical order.
 */

export type OptionGroupType = "single" | "multiple";

export interface ProductOption {
  optionId: string;
  name: string;
  priceDeltaMinor: number;
  active: boolean;
}

export interface ProductOptionGroup {
  groupId: string;
  name: string;
  type: OptionGroupType;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  active: boolean;
  options: ProductOption[];
}

export interface ItemSelection {
  groupId: string;
  optionIds: string[];
}

export interface ResolvedSelection {
  groupId: string;
  groupName: string;
  optionIds: string[];
  optionNames: string[];
  priceDeltaMinor: number;
}

export interface OptionValidation {
  ok: boolean;
  error?: string;
  resolved: ResolvedSelection[];
  priceDeltaMinor: number;
}

function isOptionGroupType(value: unknown): value is OptionGroupType {
  return value === "single" || value === "multiple";
}

/** Normalises the stored configuration of a product. */
export function optionGroupsOf(product: {
  optionGroups?: unknown;
}): ProductOptionGroup[] {
  const raw = product.optionGroups;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((group): ProductOptionGroup | null => {
      if (!group || typeof group !== "object") return null;
      const g = group as Record<string, unknown>;
      const groupId = String(g.groupId ?? "").trim();
      const name = String(g.name ?? "").trim();
      if (!groupId || !name) return null;

      const optionsRaw = Array.isArray(g.options) ? g.options : [];
      const options: ProductOption[] = optionsRaw
        .map((option): ProductOption | null => {
          if (!option || typeof option !== "object") return null;
          const o = option as Record<string, unknown>;
          const optionId = String(o.optionId ?? "").trim();
          const optionName = String(o.name ?? "").trim();
          if (!optionId || !optionName) return null;
          const delta = Number(o.priceDeltaMinor ?? 0);
          return {
            optionId,
            name: optionName,
            priceDeltaMinor: Number.isFinite(delta) ? Math.round(delta) : 0,
            active: o.active !== false,
          };
        })
        .filter((option): option is ProductOption => option !== null);

      const type = isOptionGroupType(g.type) ? g.type : "single";
      const minSelections = Math.max(
        0,
        Math.min(Number(g.minSelections ?? (type === "single" ? 1 : 0)) || 0, options.length)
      );
      const maxSelections = Math.max(
        minSelections,
        Math.min(Number(g.maxSelections ?? (type === "single" ? 1 : options.length)) || options.length, options.length)
      );

      return {
        groupId,
        name,
        type,
        required: Boolean(g.required) || minSelections > 0,
        minSelections,
        maxSelections,
        active: g.active !== false,
        options,
      };
    })
    .filter((group): group is ProductOptionGroup => group !== null);
}

/**
 * Parses and validates an option-group configuration coming from a dashboard
 * request. Invalid configurations are rejected instead of being silently
 * dropped, so a restaurant never loses a group by accident.
 */
export function parseOptionGroups(
  value: unknown
): { ok: true; groups: ProductOptionGroup[] } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, groups: [] };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: "Invalid option groups" };
  }
  if (value.length > 10) {
    return { ok: false, error: "Too many option groups" };
  }
  const groups = optionGroupsOf({ optionGroups: value });
  if (groups.length !== value.length) {
    return { ok: false, error: "Invalid option group configuration" };
  }
  const groupIds = new Set<string>();
  for (const group of groups) {
    if (groupIds.has(group.groupId)) {
      return { ok: false, error: "Duplicate option group" };
    }
    groupIds.add(group.groupId);
    if (group.options.length > 20) {
      return { ok: false, error: "Too many options in a group" };
    }
    const optionIds = new Set<string>();
    for (const option of group.options) {
      if (optionIds.has(option.optionId)) {
        return { ok: false, error: "Duplicate option in group" };
      }
      optionIds.add(option.optionId);
      if (Math.abs(option.priceDeltaMinor) > 100_000_000) {
        return { ok: false, error: "Invalid option price" };
      }
    }
    if (group.required && group.minSelections < 1) {
      return { ok: false, error: "A required group needs a minimum of 1" };
    }
  }
  return { ok: true, groups };
}

/**
 * Validates the customer's selections against the product configuration and
 * resolves the price delta. Unknown groups/options are rejected, required
 * groups must be answered, and min/max selection counts are enforced.
 */
export function validateSelections(
  groups: ProductOptionGroup[],
  selections: ItemSelection[] | undefined
): OptionValidation {
  const resolved: ResolvedSelection[] = [];
  let priceDeltaMinor = 0;

  const activeGroups = groups.filter((group) => group.active);
  const provided = new Map(
    (selections ?? []).map((selection) => [selection.groupId, selection.optionIds ?? []])
  );

  for (const group of activeGroups) {
    const optionIds = provided.get(group.groupId) ?? [];
    const known = group.options.filter((option) => option.active);
    const knownIds = new Set(known.map((option) => option.optionId));

    for (const optionId of optionIds) {
      if (!knownIds.has(optionId)) {
        return {
          ok: false,
          error: `That option is no longer available for ${group.name}.`,
          resolved,
          priceDeltaMinor,
        };
      }
    }

    const uniqueIds = Array.from(new Set(optionIds));
    if (group.type === "single" && uniqueIds.length > 1) {
      return {
        ok: false,
        error: `Choose only one option for ${group.name}.`,
        resolved,
        priceDeltaMinor,
      };
    }
    if (uniqueIds.length < group.minSelections) {
      return {
        ok: false,
        error:
          group.minSelections === 1
            ? `Please choose an option for ${group.name}.`
            : `Please choose at least ${group.minSelections} options for ${group.name}.`,
        resolved,
        priceDeltaMinor,
      };
    }
    if (uniqueIds.length > group.maxSelections) {
      return {
        ok: false,
        error: `Choose at most ${group.maxSelections} option(s) for ${group.name}.`,
        resolved,
        priceDeltaMinor,
      };
    }

    const chosen = known.filter((option) => uniqueIds.includes(option.optionId));
    const delta = chosen.reduce((sum, option) => sum + option.priceDeltaMinor, 0);
    priceDeltaMinor += delta;

    resolved.push({
      groupId: group.groupId,
      groupName: group.name,
      optionIds: chosen.map((option) => option.optionId),
      optionNames: chosen.map((option) => option.name),
      priceDeltaMinor: delta,
    });
  }

  // A selection for a group that no longer exists must not be silently ignored.
  for (const groupId of Array.from(provided.keys())) {
    if (!activeGroups.some((group) => group.groupId === groupId)) {
      return {
        ok: false,
        error: "One of the chosen options is no longer available.",
        resolved,
        priceDeltaMinor,
      };
    }
  }

  return { ok: true, resolved, priceDeltaMinor };
}

/** Line total for one product line (base price + option deltas) times quantity. */
export function lineTotalMinor(
  basePriceMinor: number,
  priceDeltaMinor: number,
  quantity: number
): number {
  return (basePriceMinor + priceDeltaMinor) * quantity;
}
