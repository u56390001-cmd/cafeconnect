"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatMoney } from "@/lib/domain/money";
import { normalizePhone, PHONE_HINT } from "@/lib/domain/phone";
import type { StoreItem } from "@/app/store/types";

export interface CartLine {
  itemId: string;
  quantity: number;
  /** Chosen options (ids only - the server resolves names and prices). */
  selections?: Array<{ groupId: string; optionIds: string[] }>;
  /** Resolved option labels for the customer view. */
  optionLabels?: string[];
}

/** A cart line is identified by the product and the chosen options. */
export function cartLineKey(line: CartLine): string {
  const signature = (line.selections ?? [])
    .map(
      (selection) =>
        `${selection.groupId}:${selection.optionIds.slice().sort().join(",")}`
    )
    .sort()
    .join("|");
  return signature ? `${line.itemId}::${signature}` : line.itemId;
}

export interface CheckoutDetails {
  customerName: string;
  customerPhone: string;
  area: string;
  house: string;
  landmark: string;
  notes: string;
}

export interface QuoteResult {
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  appliedOffer: string | null;
  minimumOrderMinor: number | null;
  shortfallMinor: number;
  deliveryAreaStatus: string;
  deliveryAreaLabel: string | null;
}

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: StoreItem[];
  lines: CartLine[];
  currency: string;
  deliveryFeeMinor: number;
  minimumOrderMinor: number;
  pickupAvailable: boolean;
  paymentMethods: string;
  fulfilmentType: "delivery" | "pickup";
  onFulfilmentChange: (value: "delivery" | "pickup") => void;
  onQuantityChange: (lineKey: string, quantity: number) => void;
  onRemove: (lineKey: string) => void;
  subtotalMinor: number;
  quote: QuoteResult | null;
  quoteError: string | null;
  details: CheckoutDetails;
  onDetailsChange: (details: CheckoutDetails) => void;
  fieldError: string | null;
  submitting: boolean;
  onSubmit: () => void;
}

export function CartSheet({
  open,
  onOpenChange,
  items,
  lines,
  currency,
  deliveryFeeMinor,
  minimumOrderMinor,
  pickupAvailable,
  paymentMethods,
  fulfilmentType,
  onFulfilmentChange,
  onQuantityChange,
  onRemove,
  subtotalMinor,
  quote,
  quoteError,
  details,
  onDetailsChange,
  fieldError,
  submitting,
  onSubmit,
}: CartSheetProps) {
  const lineFor = (itemId: string) => lines.find((l) => l.itemId === itemId);
  const itemFor = (itemId: string) => items.find((i) => i.itemId === itemId);
  const shortfallMinor = quote?.shortfallMinor ?? 0;
  const totalMinor = quote?.totalMinor ?? subtotalMinor + deliveryFeeMinor;
  const canSubmit = lines.length > 0 && shortfallMinor === 0 && !submitting;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-md sm:side-right"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="text-base">Your order</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Your cart is empty. Add something from the menu.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {lines.map((line) => {
                const item = itemFor(line.itemId);
                if (!item) return null;
                const lineKey = cartLineKey(line);
                const unitMinor =
                  item.priceMinor +
                  (line.selections ?? []).reduce((sum, selection) => {
                    const group = item.optionGroups?.find(
                      (g) => g.groupId === selection.groupId
                    );
                    if (!group) return sum;
                    return (
                      sum +
                      selection.optionIds.reduce((optionSum, optionId) => {
                        const option = group.options.find(
                          (o) => o.optionId === optionId
                        );
                        return optionSum + (option?.priceDeltaMinor ?? 0);
                      }, 0)
                    );
                  }, 0);
                return (
                  <li
                    key={lineKey}
                    className="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.name}</p>
                        {line.optionLabels?.length ? (
                          <p className="text-xs text-muted-foreground">
                            {line.optionLabels.join(" · ")}
                          </p>
                        ) : item.description ? (
                          <p className="text-xs text-muted-foreground">
                            {item.description}
                          </p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-sm font-medium">
                        {formatMoney(unitMinor * line.quantity, currency)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-9"
                          aria-label={`Remove one ${item.name}`}
                          onClick={() =>
                            onQuantityChange(lineKey, line.quantity - 1)
                          }
                        >
                          <Minus />
                        </Button>
                        <span className="w-8 text-center text-sm tabular-nums">
                          {line.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-9"
                          aria-label={`Add one ${item.name}`}
                          onClick={() =>
                            onQuantityChange(lineKey, line.quantity + 1)
                          }
                        >
                          <Plus />
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-muted-foreground"
                        onClick={() => onRemove(lineKey)}
                      >
                        <Trash2 data-icon="inline-start" />
                        Remove
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {lines.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">
                    {formatMoney(quote?.subtotalMinor ?? subtotalMinor, currency)}
                  </span>
                </div>
                {quote && quote.discountMinor > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Discount{quote.appliedOffer ? ` (${quote.appliedOffer})` : ""}
                    </span>
                    <span className="tabular-nums text-success">
                      −{formatMoney(quote.discountMinor, currency)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Delivery
                    {fulfilmentType === "pickup" ? " (pickup)" : ""}
                  </span>
                  <span className="tabular-nums">
                    {fulfilmentType === "pickup"
                      ? formatMoney(0, currency)
                      : formatMoney(quote?.deliveryFeeMinor ?? deliveryFeeMinor, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">
                    {formatMoney(totalMinor, currency)}
                  </span>
                </div>
              </div>

              {shortfallMinor > 0 ? (
                <Alert className="mt-4">
                  <AlertTitle>
                    Add {formatMoney(shortfallMinor, currency)} more
                  </AlertTitle>
                  <AlertDescription>
                    Minimum order is{" "}
                    {formatMoney(minimumOrderMinor ?? 0, currency)}. You can
                    continue once the total reaches it.
                  </AlertDescription>
                </Alert>
              ) : null}

              {quoteError ? (
                <Alert variant="destructive" className="mt-4">
                  <AlertTitle>Could not update the total</AlertTitle>
                  <AlertDescription>{quoteError}</AlertDescription>
                </Alert>
              ) : null}

              <Separator className="my-5" />

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="checkout-name">Your name</Label>
                  <Input
                    id="checkout-name"
                    value={details.customerName}
                    autoComplete="name"
                    onChange={(e) =>
                      onDetailsChange({
                        ...details,
                        customerName: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="checkout-phone">Phone number</Label>
                  <Input
                    id="checkout-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0300 1234567"
                    value={details.customerPhone}
                    aria-invalid={fieldError ? true : undefined}
                    onChange={(e) =>
                      onDetailsChange({
                        ...details,
                        customerPhone: e.target.value,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">{PHONE_HINT}</p>
                </div>

                {pickupAvailable && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="checkout-fulfilment">How do you want it?</Label>
                    <select
                      id="checkout-fulfilment"
                      value={fulfilmentType}
                      onChange={(e) =>
                        onFulfilmentChange(
                          e.target.value === "pickup" ? "pickup" : "delivery"
                        )
                      }
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="delivery">Delivery</option>
                      <option value="pickup">Pickup</option>
                    </select>
                  </div>
                )}

                {fulfilmentType === "delivery" && (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="checkout-area">
                        Area, society or sector
                      </Label>
                      <Input
                        id="checkout-area"
                        value={details.area}
                        onChange={(e) =>
                          onDetailsChange({ ...details, area: e.target.value })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="checkout-house">
                        House, street or building number
                      </Label>
                      <Input
                        id="checkout-house"
                        value={details.house}
                        onChange={(e) =>
                          onDetailsChange({ ...details, house: e.target.value })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="checkout-landmark">
                        Landmark or delivery directions (optional)
                      </Label>
                      <Input
                        id="checkout-landmark"
                        value={details.landmark}
                        onChange={(e) =>
                          onDetailsChange({
                            ...details,
                            landmark: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="checkout-notes">
                    Order notes (optional, {details.notes.length}/500)
                  </Label>
                  <Textarea
                    id="checkout-notes"
                    rows={3}
                    maxLength={500}
                    value={details.notes}
                    placeholder="Less spicy, extra raita, call on arrival…"
                    onChange={(e) =>
                      onDetailsChange({ ...details, notes: e.target.value })
                    }
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Payment: {paymentMethods}
                </p>

                {fieldError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {fieldError}
                  </p>
                ) : null}

                <Button
                  className="w-full"
                  size="lg"
                  disabled={!canSubmit}
                  onClick={onSubmit}
                >
                  {submitting
                    ? "Placing order…"
                    : `Place order · ${formatMoney(totalMinor, currency)}`}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
