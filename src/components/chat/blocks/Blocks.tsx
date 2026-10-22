"use client";

import { Headset, Info, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type {
  WidgetCartSummary,
  WidgetOrderSummary,
} from "@/lib/widget/ui-contract";

/** Quick reply chips: one tap sends a verified prompt. */
export function QuickReplies({
  items,
  onSelect,
  disabled,
}: {
  items: Array<{ id: string; label: string }>;
  onSelect: (label: string) => void;
  disabled?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(item.label)}
          className="min-h-9 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-60"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Informational notice (delivery area, minimum order, sold out ...). */
export function NoticeCard({
  tone,
  text,
}: {
  tone: "info" | "warning";
  text: string;
}) {
  return (
    <p
      className={cn(
        "rounded-lg border px-3 py-2 text-xs",
        tone === "warning"
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-border bg-muted/60 text-muted-foreground"
      )}
    >
      <Info className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden="true" />
      {text}
    </p>
  );
}

/** The assistant handed the conversation to a human. */
export function HandoffCard({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
      <Headset className="mr-1.5 inline size-3.5 align-[-2px]" aria-hidden="true" />
      {text}
    </p>
  );
}

/** Verified cart summary. The number is a subtotal until the server quotes. */
export function CartSummaryCard({
  cart,
  onViewCart,
}: {
  cart: WidgetCartSummary;
  onViewCart?: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <ReceiptText className="size-4 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-semibold">
          {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"} in your cart
        </p>
      </div>

      <ul className="mt-2 flex flex-col gap-1">
        {cart.lines.map((line, index) => (
          <li key={`${line.itemId}-${index}`} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {line.quantity}× {line.name}
            </span>
            {line.options.length > 0 ? (
              <span>
                {" — "}
                {line.options
                  .map(
                    (option) =>
                      `${option.groupName}: ${option.optionNames.join(", ")}`
                  )
                  .join(" · ")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <Separator className="my-2" />

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {cart.totalIsFinal ? "Total" : "Subtotal (fees not confirmed yet)"}
        </span>
        <span className="font-semibold tabular-nums">{cart.totalLabel}</span>
      </div>

      {onViewCart ? (
        <Button size="sm" variant="outline" className="mt-2 h-9" onClick={onViewCart}>
          View cart
        </Button>
      ) : null}
    </div>
  );
}

/** Verified order receipt. Never rendered before the server confirmed. */
export function OrderConfirmationCard({
  order,
  currency,
}: {
  order: WidgetOrderSummary;
  currency: string;
}) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm font-semibold">Order placed</p>
      <p className="text-xs text-muted-foreground">
        Order number{" "}
        <span className="font-semibold text-foreground">{order.orderNumber}</span>
      </p>

      <ul className="mt-2 flex flex-col gap-1">
        {order.lines.map((line, index) => (
          <li key={`${line.itemId}-${index}`} className="text-xs">
            <span className="font-medium">
              {line.quantity}× {line.name}
            </span>
            {line.options.length > 0 ? (
              <span className="text-muted-foreground">
                {" — "}
                {line.options
                  .map(
                    (option) =>
                      `${option.groupName}: ${option.optionNames.join(", ")}`
                  )
                  .join(" · ")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <Separator className="my-2" />

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Total paid on delivery</span>
        <span className="font-semibold tabular-nums">{order.totalLabel}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {order.fulfilmentType === "pickup"
          ? "Pickup from the restaurant"
          : `Delivering to ${order.address ?? "your address"}`}
      </p>

      {order.trackUrl ? (
        <Button size="sm" variant="outline" className="mt-2 h-9" asChild>
          <a href={order.trackUrl}>Track order</a>
        </Button>
      ) : null}
    </div>
  );
}
