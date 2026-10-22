"use client";

import { useState } from "react";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatMoney } from "@/lib/domain/money";
import { normalizePhone } from "@/lib/domain/phone";
import type { WidgetCartSummary } from "@/lib/widget/ui-contract";

export interface WidgetCartState extends WidgetCartSummary {
  currency: string;
}

interface CartPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: WidgetCartState | null;
  onQuantityChange: (lineIndex: number, quantity: number) => void;
  onRemove: (lineIndex: number) => void;
  onCheckout: (details: {
    customerName: string;
    customerPhone: string;
    fulfilmentType: "delivery" | "pickup";
    address: string;
    notes: string;
  }) => Promise<void>;
  submitting: boolean;
  error: string | null;
  pickupAvailable: boolean;
  minimumOrderMinor: number;
  minimumOrderLabel: string | null;
}

export function CartPanel({
  open,
  onOpenChange,
  cart,
  onQuantityChange,
  onRemove,
  onCheckout,
  submitting,
  error,
  pickupAvailable,
  minimumOrderMinor,
  minimumOrderLabel,
}: CartPanelProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [fulfilmentType, setFulfilmentType] = useState<"delivery" | "pickup">(
    "delivery"
  );
  const [area, setArea] = useState("");
  const [house, setHouse] = useState("");
  const [landmark, setLandmark] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const currency = cart?.currency ?? "PKR";
  const lines = cart?.lines ?? [];
  const address = [area, house, landmark].filter(Boolean).join(", ");
  const shortfall = Math.max(
    0,
    minimumOrderMinor - (cart?.subtotalMinor ?? 0)
  );

  async function submit() {
    setFormError(null);
    if (customerName.trim().length < 2) {
      setFormError("Please enter your name.");
      return;
    }
    const phone = normalizePhone(customerPhone);
    if (!phone.ok) {
      setFormError(phone.error ?? "Enter a valid phone number.");
      return;
    }
    if (fulfilmentType === "delivery" && address.trim().length < 8) {
      setFormError("Please add your area and house or street number.");
      return;
    }
    await onCheckout({
      customerName: customerName.trim(),
      customerPhone: phone.normalized,
      fulfilmentType,
      address: fulfilmentType === "delivery" ? address : "",
      notes: notes.trim(),
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="text-base">Your cart</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Your cart is empty. Add something from the menu.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {lines.map((line, index) => (
                <li
                  key={`${line.itemId}-${index}`}
                  className="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{line.name}</p>
                      {line.options.length > 0 ? (
                        <p className="text-[11px] text-muted-foreground">
                          {line.options
                            .map(
                              (option) =>
                                `${option.groupName}: ${option.optionNames.join(", ")}`
                            )
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm font-medium tabular-nums">
                      {formatMoney(line.lineTotalMinor, currency)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-9"
                        aria-label={`Remove one ${line.name}`}
                        onClick={() => onQuantityChange(index, line.quantity - 1)}
                      >
                        <Minus />
                      </Button>
                      <span className="w-6 text-center text-sm tabular-nums">
                        {line.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-9"
                        aria-label={`Add one ${line.name}`}
                        onClick={() => onQuantityChange(index, line.quantity + 1)}
                      >
                        <Plus />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-muted-foreground"
                      onClick={() => onRemove(index)}
                    >
                      <Trash2 data-icon="inline-start" />
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {lines.length > 0 ? (
            <>
              <Separator className="my-3" />
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">
                    {formatMoney(cart?.subtotalMinor ?? 0, currency)}
                  </span>
                </div>
                {cart && cart.discountMinor > 0 ? (
                  <div className="flex justify-between text-success">
                    <span>Discount{cart.appliedOffer ? ` (${cart.appliedOffer})` : ""}</span>
                    <span className="tabular-nums">
                      −{formatMoney(cart.discountMinor, currency)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  <span className="tabular-nums">
                    {formatMoney(cart?.deliveryFeeMinor ?? 0, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{cart?.totalLabel ?? ""}</span>
                </div>
              </div>

              {shortfall > 0 ? (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Add {formatMoney(shortfall, currency)} more to reach the
                  minimum order of {minimumOrderLabel ?? formatMoney(minimumOrderMinor, currency)}.
                </p>
              ) : null}
            </>
          ) : null}

          {lines.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3">
              <Separator />
              <p className="text-sm font-semibold">Delivery details</p>

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={fulfilmentType === "delivery" ? "default" : "outline"}
                  onClick={() => setFulfilmentType("delivery")}
                >
                  Delivery
                </Button>
                {pickupAvailable ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={fulfilmentType === "pickup" ? "default" : "outline"}
                    onClick={() => setFulfilmentType("pickup")}
                  >
                    Pickup
                  </Button>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cc-name" className="text-xs">
                  Your name
                </Label>
                <Input
                  id="cc-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  autoComplete="name"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cc-phone" className="text-xs">
                  Phone number
                </Label>
                <Input
                  id="cc-phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="03xx xxxxxxx"
                />
              </div>

              {fulfilmentType === "delivery" ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cc-area" className="text-xs">
                      Area
                    </Label>
                    <Input
                      id="cc-area"
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                      placeholder="Gulberg"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cc-house" className="text-xs">
                      House or street number
                    </Label>
                    <Input
                      id="cc-house"
                      value={house}
                      onChange={(e) => setHouse(e.target.value)}
                      placeholder="House 12, Street 4"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cc-landmark" className="text-xs">
                      Landmark (optional)
                    </Label>
                    <Input
                      id="cc-landmark"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                    />
                  </div>
                </>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cc-notes" className="text-xs">
                  Note for the kitchen (optional)
                </Label>
                <Textarea
                  id="cc-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {formError || error ? (
            <Alert variant="destructive" className="mt-3">
              <AlertTitle>Check the details</AlertTitle>
              <AlertDescription>{formError ?? error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        {lines.length > 0 ? (
          <div className="border-t border-border p-4">
            <Button
              className="h-11 w-full"
              disabled={submitting || shortfall > 0}
              onClick={() => void submit()}
            >
              <ShoppingBag data-icon="inline-start" />
              {submitting
                ? "Placing your order..."
                : `Place order · ${cart?.totalLabel ?? ""}`}
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
