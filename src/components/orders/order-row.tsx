"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CHANNEL_LABEL, STATUS_LABELS } from "./types";
import type { Order } from "./types";

/** Left card stripe per stage — the fastest way to scan the board. */
const STRIPE: Record<string, string> = {
  received: "border-l-warning",
  confirmed: "border-l-primary",
  preparing: "border-l-primary",
  ready: "border-l-primary",
  dispatched: "border-l-primary",
  completed: "border-l-success",
  declined: "border-l-destructive",
  cancelled: "border-l-destructive",
};

const STATUS_BADGE: Record<string, string> = {
  received: "bg-warning/10 text-warning border-warning/30",
  confirmed: "bg-primary/10 text-primary border-primary/30",
  preparing: "bg-primary/10 text-primary border-primary/30",
  ready: "bg-primary/10 text-primary border-primary/30",
  dispatched: "bg-primary/10 text-primary border-primary/30",
  completed: "bg-success/10 text-success border-success/30",
  declined: "bg-destructive/10 text-destructive border-destructive/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function itemsSummary(order: Order): string {
  const [first, ...rest] = order.items ?? [];
  if (!first) return "No items";
  const head = `${first.quantity}× ${first.name}`;
  return rest.length > 0 ? `${head} +${rest.length} more` : head;
}

interface OrderRowProps {
  order: Order;
  onPatch: (orderId: string, patch: Record<string, unknown>) => void;
  onPrint: (order: Order) => void;
}

/** One order card: stripe, header, compact meta, items, actions. */
export function OrderRow({ order, onPatch, onPrint }: OrderRowProps) {
  const nextSteps = order.allowedNext ?? [];
  const [primary, ...rest] = nextSteps;
  const summary = itemsSummary(order);
  const extraItems = (order.items?.length ?? 1) - 1;

  return (
    <li
      className={cn(
        "rounded-lg border border-border border-l-4 bg-card p-4 transition-shadow hover:shadow-sm",
        STRIPE[order.status] ?? "border-l-muted"
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <p className="text-sm font-semibold">#{order.orderNumber}</p>
        <Badge variant="outline" className={cn("px-1.5 text-[11px]", STATUS_BADGE[order.status])}>
          {STATUS_LABELS[order.status] ?? order.status}
        </Badge>
        {order.paymentStatus === "paid" ? (
          <Badge
            variant="outline"
            className="border-success/30 bg-success/10 px-1.5 text-[11px] text-success"
          >
            Paid
          </Badge>
        ) : (
          <Badge variant="outline" className="px-1.5 text-[11px] text-muted-foreground">
            {order.paymentStatus}
          </Badge>
        )}
        <span className="text-[11px] text-muted-foreground">
          {CHANNEL_LABEL[order.channel] ?? order.channel}
        </span>
        <span className="ml-auto text-xs text-muted-foreground" title={new Date(order.createdAt).toLocaleString()}>
          {order.createdAt ? relativeTime(order.createdAt) : ""}
        </span>
      </div>

      {/* Customer + items */}
      <p className="pt-1.5 text-sm">
        <span className="font-medium">{order.customer?.name || "Guest"}</span>
        {order.customer?.phone ? <span className="text-muted-foreground"> · {order.customer.phone}</span> : null}
        <span className="text-muted-foreground">
          {" · "}
          {order.fulfilment?.type === "delivery" ? "Delivery" : "Pickup"}
        </span>
        <span className="text-muted-foreground">
          {" · "}
          {summary}
          {extraItems > 0 ? (
            <span className="text-[11px]"> +{extraItems}</span>
          ) : null}
        </span>
      </p>

      {/* Full items + extras, hidden until needed to keep rows short */}
      {(extraItems > 0 || order.notes || order.appliedOffer) && (
        <details className="text-xs text-muted-foreground">
          <summary className="mt-1 cursor-pointer select-none hover:text-foreground">
            Details
          </summary>
          <div className="mt-2 space-y-1">
            {(order.items ?? []).map((item) => (
              <p key={item.itemId}>
                {item.quantity}× {item.name}
                {item.options?.length
                  ? ` — ${item.options
                      .map((o) => `${o.groupName}: ${(o.optionNames ?? []).join(", ")}`)
                      .join(" · ")}`
                  : null}
              </p>
            ))}
            {order.appliedOffer ? <p>Offer: {order.appliedOffer}</p> : null}
            {order.notes ? <p>Note: {order.notes}</p> : null}
            {order.fulfilment?.address ? <p>Address: {order.fulfilment.address}</p> : null}
          </div>
        </details>
      )}

      {/* Footer: total + actions */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-sm font-semibold tabular-nums">
          {order.currency} {(order.totalMinor / 100).toFixed(0)}
          {order.discountMinor > 0 ? (
            <span className="text-xs font-normal text-success">
              {" "}
              saved {Math.round(order.discountMinor / 100)}
            </span>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {primary ? (
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => onPatch(order.orderId, { status: primary })}
            >
              {STATUS_LABELS[primary] ?? primary}
            </Button>
          ) : null}
          {rest.map((nextStatus) => (
            <Button
              key={nextStatus}
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs"
              onClick={() => onPatch(order.orderId, { status: nextStatus })}
            >
              {STATUS_LABELS[nextStatus] ?? nextStatus}
            </Button>
          ))}
          {order.paymentStatus !== "paid" ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2.5 text-xs"
              onClick={() => onPatch(order.orderId, { paymentStatus: "paid" })}
            >
              Mark paid
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => onPrint(order)}
            aria-label={`Print ticket for order ${order.orderNumber}`}
          >
            <Printer data-icon="inline-start" />
            Print
          </Button>
        </div>
      </div>
    </li>
  );
}
