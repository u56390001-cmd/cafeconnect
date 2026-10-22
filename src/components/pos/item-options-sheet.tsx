"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatMoney } from "@/lib/domain/money";
import {
  optionGroupsOf,
  validateSelections,
  type ItemSelection,
} from "@/lib/domain/options";
import type { PosMenuItem } from "@/lib/pos/types";

interface ItemOptionsSheetProps {
  /** Product being configured, or null to close the sheet. */
  item: PosMenuItem | null;
  /** Existing selections when editing a line. */
  initialSelections?: ItemSelection[];
  initialQuantity?: number;
  currency: string;
  onConfirm: (selections: ItemSelection[], quantity: number) => void;
  onClose: () => void;
}

/**
 * Option configurator for products with option groups. Selections are
 * validated with the same domain rules the server applies, but the price a
 * staff member finally sees always comes from the quote API.
 */
export function ItemOptionsSheet({
  item,
  initialSelections,
  initialQuantity = 1,
  currency,
  onConfirm,
  onClose,
}: ItemOptionsSheetProps) {
  const groups = useMemo(
    () => optionGroupsOf({ optionGroups: item?.optionGroups }).filter(
      (group) => group.active && group.options.some((option) => option.active)
    ),
    [item]
  );

  const [selections, setSelections] = useState<ItemSelection[]>(initialSelections ?? []);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setSelections(initialSelections ?? []);
      setQuantity(initialQuantity);
      setError(null);
    }
    // Reset the form whenever the sheet opens for a different product.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, initialSelections, initialQuantity]);

  const validation = useMemo(
    () => validateSelections(groups, selections),
    [groups, selections]
  );

  const toggle = (groupId: string, optionId: string, type: "single" | "multiple", canUnselect: boolean): void => {
    setSelections((current) => {
      const existing = current.find((s) => s.groupId === groupId);
      if (type === "single") {
        if (existing?.optionIds[0] === optionId && canUnselect) {
          return current.filter((s) => s.groupId !== groupId);
        }
        const other = current.filter((s) => s.groupId !== groupId);
        return [...other, { groupId, optionIds: [optionId] }];
      }
      const other = current.filter((s) => s.groupId !== groupId);
      if (!existing) return [...other, { groupId, optionIds: [optionId] }];
      const has = existing.optionIds.includes(optionId);
      const nextIds = has
        ? existing.optionIds.filter((id) => id !== optionId)
        : [...existing.optionIds, optionId];
      if (nextIds.length === 0) return other;
      return [...other, { groupId, optionIds: nextIds }];
    });
  };

  const chosenDelta = validation.ok ? validation.priceDeltaMinor : 0;

  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto sm:max-w-md sm:rounded-t-xl">
        {item && (
          <>
            <SheetHeader>
              <SheetTitle>{item.name}</SheetTitle>
              <SheetDescription>
                {formatMoney(item.basePriceMinor, currency)} · choose the options the
                customer asked for
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 overflow-y-auto px-1">
              {groups.map((group) => {
                const type = group.type;
                const canUnselect = !group.required && group.minSelections === 0;
                const chosen =
                  selections.find((s) => s.groupId === group.groupId)?.optionIds ?? [];
                return (
                  <fieldset key={group.groupId} className="rounded-lg border p-3">
                    <legend className="px-1 text-xs font-medium">
                      {group.name}
                      {group.required ? " (required)" : ` (${type === "single" ? "pick 1" : "pick any"})`}
                    </legend>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {group.options
                        .filter((option) => option.active)
                        .map((option) => {
                          const selected = chosen.includes(option.optionId);
                          const delta = option.priceDeltaMinor;
                          return (
                            <button
                              key={option.optionId}
                              type="button"
                              aria-pressed={selected}
                              onClick={() =>
                                toggle(group.groupId, option.optionId, type, canUnselect)
                              }
                              className={cn(
                                "min-w-16 rounded-full border px-3 py-1.5 text-xs transition-colors",
                                selected
                                  ? "border-transparent bg-orange-600 text-white"
                                  : "bg-white hover:bg-muted"
                              )}
                            >
                              {option.name}
                              {delta !== 0 && <span className="ml-1">+{formatMoney(delta, currency)}</span>}
                            </button>
                          );
                        })}
                    </div>
                  </fieldset>
                );
              })}

              <fieldset className="rounded-lg border p-3">
                <legend className="px-1 text-xs font-medium">Quantity</legend>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={quantity <= 1}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    aria-label="Decrease quantity"
                  >
                    −
                  </Button>
                  <span className="w-8 text-center text-sm tabular-nums">{quantity}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={quantity >= 20}
                    onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                    aria-label="Increase quantity"
                  >
                    +
                  </Button>
                </div>
              </fieldset>

              {validation.ok && (chosenDelta !== 0 || quantity > 0) && (
                <p className="px-1 text-xs text-muted-foreground">
                  Line total ≈{" "}
                  <span className="tabular-nums font-medium">
                    {formatMoney((item.basePriceMinor + chosenDelta) * quantity, currency)}
                  </span>{" "}
                  (the order still prices on the server)
                </p>
              )}
              {!validation.ok && validation.error && (
                <p className="px-1 text-xs text-red-600" role="alert">
                  {validation.error}
                </p>
              )}
            </div>

            <SheetFooter className="gap-2">
              <Button
                onClick={() => {
                  if (!validation.ok) {
                    setError(validation.error ?? "Complete the options");
                    return;
                  }
                  onConfirm(selections, quantity);
                }}
                className="flex-1 bg-orange-600 hover:bg-orange-700"
              >
                Add to order
              </Button>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {error && <span className="sr-only">{error}</span>}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
