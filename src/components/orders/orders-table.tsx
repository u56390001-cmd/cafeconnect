"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CHANNEL_LABEL, STATUS_LABELS, type Order } from "./types";

/** Row-level tinted pills, matching the tokens in the design system. */
const STATUS_TINT: Record<string, string> = {
  received: "border-warning/30 bg-warning/10 text-warning",
  confirmed: "border-primary/30 bg-primary/10 text-primary",
  preparing: "border-primary/30 bg-primary/10 text-primary",
  ready: "border-warning/30 bg-warning/10 text-warning",
  dispatched: "border-primary/30 bg-primary/10 text-primary",
  completed: "border-success/30 bg-success/10 text-success",
  declined: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
};

const PAYMENT_TINT: Record<string, string> = {
  paid: "border-success/30 bg-success/10 text-success",
  refunded: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function paymentLabel(status: string): string {
  if (status === "paid") return "Paid";
  if (status === "refunded") return "Refunded";
  return "On hold";
}

export function paymentTint(status: string): string {
  return PAYMENT_TINT[status] ?? "border-warning/30 bg-warning/10 text-warning";
}

/** "PKR 1,240.00 / $8,633.96" — grouped, two decimals. */
export function money(minor: number, currency: string): string {
  return `${currency} ${(
    minor / 100
  ).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "Oct 6, 2025 12:18 pm" as in the reference layout. */
export function whenAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase();
  return `${day} ${time}`;
}

interface OrderTableRowProps {
  order: Order;
  selected: boolean;
  onToggle: (orderId: string) => void;
  onPatch: (orderId: string, patch: Record<string, unknown>) => void;
  onPrint: (order: Order) => void;
}

/** One table row: selection, order facts, status pills and an overflow menu. */
export function OrderTableRow({
  order,
  selected,
  onToggle,
  onPatch,
  onPrint,
}: OrderTableRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Close the overflow menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const nextSteps = order.allowedNext ?? [];
  const first = order.items?.[0];
  const extraItems = Math.max((order.items?.length ?? 0) - 1, 0);
  const statusTint = STATUS_TINT[order.status] ?? "border-border bg-accent text-muted-foreground";

  return (
    <tr
      data-state={selected ? "selected" : undefined}
      data-testid="order-table-row"
      data-orderid={order.orderId}
      className="transition-colors"
    >
      <td className="w-12 pl-5 pr-2 align-middle">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggle(order.orderId)}
          aria-label={`Select order ${order.orderNumber}`}
          className="mt-0.5"
        />
      </td>
      <td className="whitespace-nowrap px-2 py-4 text-sm font-medium">
        #{order.orderNumber}
      </td>
      <td className="px-2 py-4 text-sm">
        <span className="truncate">
          {first ? `${first.quantity}× ${first.name}` : "No items"}
        </span>
        {extraItems > 0 ? (
          <span className="text-xs text-muted-foreground"> +{extraItems} more</span>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-2 py-4 text-sm tabular-nums">
        {money(order.totalMinor, order.currency)}
      </td>
      <td className="px-2 py-4">
        <span
          className={cn(
            "inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            statusTint
          )}
        >
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-4 text-xs text-muted-foreground" title={new Date(order.createdAt).toLocaleString()}>
        {order.createdAt ? whenAt(order.createdAt) : ""}
      </td>
      <td className="px-2 py-4">
        <span
          className={cn(
            "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
            paymentTint(order.paymentStatus)
          )}
        >
          {paymentLabel(order.paymentStatus)}
        </span>
      </td>
      <td className="relative pr-5 text-right align-middle">
        <Button
          ref={buttonRef}
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={`Actions for order ${order.orderNumber}`}
          aria-expanded={menuOpen}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
        {menuOpen && (
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Actions for order ${order.orderNumber}`}
            className="absolute right-5 top-11 z-30 w-44 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-md"
          >
            {nextSteps.map((step) => (
              <button
                key={step}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onPatch(order.orderId, { status: step });
                }}
                className="flex w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent"
              >
                Mark as {STATUS_LABELS[step] ?? step}
              </button>
            ))}
            {nextSteps.length > 0 ? (
              <div className="mx-2 my-1 h-px bg-border" aria-hidden="true" />
            ) : null}
            {order.paymentStatus !== "paid" && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onPatch(order.orderId, { paymentStatus: "paid" });
                }}
                className="flex w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent"
              >
                Mark paid
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setDetailsOpen(true);
              }}
              className="flex w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent"
            >
              View details
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onPrint(order);
              }}
              className="flex w-full rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent"
            >
              <Printer className="mr-2 size-4" aria-hidden="true" />
              Print ticket
            </button>
          </div>
        )}
      </td>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Order #{order.orderNumber}</DialogTitle>
            <DialogDescription>
              {order.createdAt ? whenAt(order.createdAt) : ""} ·{" "}
              {CHANNEL_LABEL[order.channel] ?? order.channel}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Customer: </span>
              {order.customer?.name || "Guest"}
              {order.customer?.phone ? ` · ${order.customer.phone}` : ""}
            </p>
            <p>
              <span className="text-muted-foreground">Fulfilment: </span>
              {order.fulfilment?.type === "delivery" ? "Delivery" : "Pickup"}
              {order.fulfilment?.address ? ` · ${order.fulfilment.address}` : ""}
            </p>
            {order.notes ? (
              <p>
                <span className="text-muted-foreground">Note: </span>
                {order.notes}
              </p>
            ) : null}
            {order.appliedOffer ? (
              <p>
                <span className="text-muted-foreground">Offer: </span>
                {order.appliedOffer}
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border border-border p-3">
            <ul className="space-y-1.5 text-sm">
              {(order.items ?? []).map((item) => (
                <li key={item.itemId} className="flex items-baseline justify-between gap-3">
                  <span>
                    {item.quantity}× {item.name}
                    {item.options?.length
                      ? ` — ${item.options
                          .map((o) => `${o.groupName}: ${(o.optionNames ?? []).join(", ")}`)
                          .join(" · ")}`
                      : ""}
                  </span>
                  <span className="whitespace-nowrap tabular-nums">
                    {money(item.unitPriceMinor * item.quantity, order.currency)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm font-semibold">
              <span>Payment: {paymentLabel(order.paymentStatus)}</span>
              <span className="tabular-nums">
                {money(order.totalMinor, order.currency)}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </tr>
  );
}
