"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type {
  WidgetProduct,
  WidgetProductOptionGroup,
} from "@/lib/widget/ui-contract";

export interface WidgetSelection {
  groupId: string;
  optionIds: string[];
}

interface ItemConfiguratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: WidgetProduct | null;
  onAdd: (
    product: WidgetProduct,
    selections: WidgetSelection[],
    quantity: number
  ) => void;
}

/**
 * In-widget item configurator.
 *
 * Radio for single choice, checkboxes for multiple choice, required groups
 * marked, each option shows its extra price. The displayed total is an
 * estimate - the server re-prices the line when the item is added.
 */
export function ItemConfigurator({
  open,
  onOpenChange,
  product,
  onAdd,
}: ItemConfiguratorProps) {
  const groups = useMemo(
    () => (product?.optionGroups ?? []).filter((group) => group.options.length > 0),
    [product]
  );
  const [selections, setSelections] = useState<WidgetSelection[]>([]);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!open || !product) return;
    setQuantity(1);
    setSelections(
      groups.map((group) => ({
        groupId: group.groupId,
        optionIds:
          group.type === "single" && group.options[0]
            ? [group.options[0].optionId]
            : [],
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.itemId]);

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

  const missingRequired = groups.some((group) => {
    const chosen =
      selections.find((s) => s.groupId === group.groupId)?.optionIds.length ?? 0;
    const minimum = Math.max(group.required ? 1 : 0, group.minSelections);
    return chosen < minimum;
  });

  const toggle = (group: WidgetProductOptionGroup, optionId: string) => {
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

  const unitMinor = (product?.priceMinor ?? 0) + deltaMinor;
  const money = (minor: number) =>
    `${product?.currency ?? "PKR"} ${Math.round(minor / 100)}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-0"
      >
        <SheetHeader className="p-4 pb-0">
          <SheetTitle className="text-base">{product?.name ?? ""}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 p-4">
          {product?.description ? (
            <p className="text-xs text-muted-foreground">{product.description}</p>
          ) : null}

          {groups.map((group) => (
            <section key={group.groupId} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label className="text-sm font-medium">{group.name}</Label>
                <span className="text-[11px] text-muted-foreground">
                  {group.required || group.minSelections > 0 ? "Required" : "Optional"}
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
                  onValueChange={(value) => toggle(group, value)}
                  className="gap-1.5"
                >
                  {group.options.map((option) => (
                    <label
                      key={option.optionId}
                      className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <RadioGroupItem
                          value={option.optionId}
                          id={`cc-${group.groupId}-${option.optionId}`}
                        />
                        <span>{option.name}</span>
                      </span>
                      {option.priceDeltaMinor !== 0 ? (
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {option.priceDeltaMinor > 0 ? "+" : ""}
                          {money(option.priceDeltaMinor)}
                        </span>
                      ) : null}
                    </label>
                  ))}
                </RadioGroup>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {group.options.map((option) => {
                    const checked =
                      selections
                        .find((s) => s.groupId === group.groupId)
                        ?.optionIds.includes(option.optionId) ?? false;
                    return (
                      <label
                        key={option.optionId}
                        className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggle(group, option.optionId)}
                          />
                          <span>{option.name}</span>
                        </span>
                        {option.priceDeltaMinor !== 0 ? (
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {option.priceDeltaMinor > 0 ? "+" : ""}
                            {money(option.priceDeltaMinor)}
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

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="outline"
                className="size-9"
                aria-label="Decrease quantity"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus />
              </Button>
              <span className="w-6 text-center text-sm tabular-nums">{quantity}</span>
              <Button
                size="icon"
                variant="outline"
                className="size-9"
                aria-label="Increase quantity"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
              >
                <Plus />
              </Button>
            </div>
            <Button
              className="h-10 flex-1"
              disabled={!product || missingRequired}
              onClick={() => {
                if (!product) return;
                onAdd(
                  product,
                  selections.filter((s) => s.optionIds.length > 0),
                  quantity
                );
              }}
            >
              {missingRequired
                ? "Choose the required options"
                : `Add to cart · ${money(unitMinor * quantity)}`}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            The final price is confirmed by the restaurant when the order is placed.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
