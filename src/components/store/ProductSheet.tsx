"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/domain/money";
import type { StoreItem, StoreOptionGroup } from "@/app/store/types";

export interface ProductSelection {
  groupId: string;
  optionIds: string[];
}

interface ProductSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: StoreItem | null;
  currency: string;
  onAdd: (
    item: StoreItem,
    selections: ProductSelection[],
    quantity: number
  ) => void;
}

function activeGroups(item: StoreItem | null): StoreOptionGroup[] {
  if (!item?.optionGroups) return [];
  return item.optionGroups.filter((group) => group.active !== false);
}

export function ProductSheet({
  open,
  onOpenChange,
  item,
  currency,
  onAdd,
}: ProductSheetProps) {
  const groups = activeGroups(item);
  const [selections, setSelections] = useState<ProductSelection[]>([]);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!open || !item) return;
    setQuantity(1);
    setSelections(
      groups.map((group) => ({
        groupId: group.groupId,
        optionIds:
          group.type === "single" && group.options[0]?.optionId
            ? [group.options[0].optionId]
            : [],
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.itemId]);

  const deltaMinor = useMemo(() => {
    let sum = 0;
    for (const selection of selections) {
      const group = groups.find((g) => g.groupId === selection.groupId);
      if (!group) continue;
      for (const optionId of selection.optionIds) {
        const option = group.options.find((o) => o.optionId === optionId);
        if (option) sum += option.priceDeltaMinor;
      }
    }
    return sum;
  }, [selections, groups]);

  const missingRequired = useMemo(
    () =>
      groups.some(
        (group) =>
          (group.required || group.minSelections > 0) &&
          (selections.find((s) => s.groupId === group.groupId)?.optionIds.length ??
            0) < Math.max(1, group.minSelections)
      ),
    [groups, selections]
  );

  const toggleOption = (group: StoreOptionGroup, optionId: string) => {
    setSelections((current) => {
      const existing = current.find((s) => s.groupId === group.groupId);
      if (group.type === "single") {
        return [
          ...current.filter((s) => s.groupId !== group.groupId),
          { groupId: group.groupId, optionIds: [optionId] },
        ];
      }
      const optionIds = existing?.optionIds ?? [];
      if (optionIds.includes(optionId)) {
        return current.map((s) =>
          s.groupId === group.groupId
            ? { ...s, optionIds: optionIds.filter((id) => id !== optionId) }
            : s
        );
      }
      if (optionIds.length >= group.maxSelections) return current;
      return current.map((s) =>
        s.groupId === group.groupId
          ? { ...s, optionIds: [...optionIds, optionId] }
          : s
      );
    });
  };

  const unitPriceMinor = (item?.priceMinor ?? 0) + deltaMinor;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] overflow-y-auto rounded-t-2xl p-0"
      >
        <SheetHeader className="p-4 pb-0">
          <SheetTitle className="text-lg">{item?.name ?? ""}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 p-4">
          {item?.description ? (
            <p className="text-sm text-muted-foreground">{item.description}</p>
          ) : null}

          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">
              {formatMoney(unitPriceMinor, currency)}
            </span>
            {item?.portion ? (
              <Badge variant="secondary">{item.portion}</Badge>
            ) : null}
            {item?.spiceLevel ? (
              <Badge variant="outline">Spice: {item.spiceLevel}</Badge>
            ) : null}
          </div>

          {item?.dietaryLabels?.length ? (
            <div className="flex flex-wrap gap-1">
              {item.dietaryLabels.map((label) => (
                <Badge key={label} variant="secondary">
                  {label}
                </Badge>
              ))}
            </div>
          ) : null}

          {groups.map((group) => (
            <section key={group.groupId} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label className="font-medium">{group.name}</Label>
                <span className="text-xs text-muted-foreground">
                  {group.required || group.minSelections > 0
                    ? "Required"
                    : "Optional"}
                  {group.type === "multiple" && group.maxSelections < group.options.length
                    ? ` · up to ${group.maxSelections}`
                    : ""}
                </span>
              </div>

              {group.type === "single" ? (
                <RadioGroup
                  value={
                    selections.find((s) => s.groupId === group.groupId)?.optionIds[0] ??
                    ""
                  }
                  onValueChange={(value) => toggleOption(group, value)}
                  className="gap-2"
                >
                  {group.options
                    .filter((option) => option.active !== false)
                    .map((option) => (
                      <label
                        key={option.optionId}
                        className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <RadioGroupItem
                            value={option.optionId}
                            id={`${group.groupId}-${option.optionId}`}
                          />
                          <span>{option.name}</span>
                        </span>
                        {option.priceDeltaMinor !== 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {option.priceDeltaMinor > 0 ? "+" : ""}
                            {formatMoney(option.priceDeltaMinor, currency)}
                          </span>
                        ) : null}
                      </label>
                    ))}
                </RadioGroup>
              ) : (
                <div className="space-y-2">
                  {group.options
                    .filter((option) => option.active !== false)
                    .map((option) => {
                      const checked =
                        selections
                          .find((s) => s.groupId === group.groupId)
                          ?.optionIds.includes(option.optionId) ?? false;
                      return (
                        <label
                          key={option.optionId}
                          className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                        >
                          <span className="flex items-center gap-2">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() =>
                                toggleOption(group, option.optionId)
                              }
                            />
                            <span>{option.name}</span>
                          </span>
                          {option.priceDeltaMinor !== 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {option.priceDeltaMinor > 0 ? "+" : ""}
                              {formatMoney(option.priceDeltaMinor, currency)}
                            </span>
                          ) : null}
                        </label>
                      );
                    })}
                </div>
              )}
            </section>
          ))}

          <Separator />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                aria-label="Decrease quantity"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-6 text-center text-sm font-medium">{quantity}</span>
              <Button
                size="icon"
                variant="outline"
                aria-label="Increase quantity"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button
              className="flex-1"
              disabled={!item || missingRequired}
              onClick={() => {
                if (!item) return;
                onAdd(
                  item,
                  selections.filter((selection) => selection.optionIds.length > 0),
                  quantity
                );
              }}
            >
              {missingRequired
                ? "Choose the required options"
                : `Add to cart · ${formatMoney(unitPriceMinor * quantity, currency)}`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
