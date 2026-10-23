"use client";

import { useState } from "react";
import {
  Ban,
  BellRing,
  Bike,
  Check,
  ChefHat,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  Printer,
  XCircle,
  type LucideIcon,
} from "lucide-react";
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

/** Icon + accessible name for every legal status action. */
const STEP_ACTION: Record<string, { icon: LucideIcon; destructive?: boolean }> = {
  confirmed: { icon: Check },
  preparing: { icon: ChefHat },
  ready: { icon: BellRing },
  dispatched: { icon: Bike },
  completed: { icon: CheckCircle2 },
  declined: { icon: Ban, destructive: true },
  cancelled: { icon: XCircle, destructive: true },
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
  return `${currency} ${(minor / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Short, scannable order ID. "TC-261023-4F9B2A1C" reads as "#4F9B2A1C";
 * the full number always stays available via the row's title tooltip.
 */
export function orderNumberShort(orderNumber: string): string {
  const match = /^TC-\d{6}-([0-9A-HJ-NP-Z0-9]+)$/i.exec(orderNumber);
  return match ? `#${match[1].toUpperCase()}` : `#${orderNumber}`;
}

/** "Oct 6, 2025" + "12:18 pm" as in the reference layout. */
export function whenDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function whenTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase();
}

interface OrderTableRowProps {
  order: Order;
  selected: boolean;
  onToggle: (orderId: string) => void;
  onPatch: (orderId: string, patch: Record<string, unknown>) => void;
  onPrint: (order: Order) => void;
}

/**
 * One table row: selection, compact order facts, status pills and always
 * visible action icons — no hidden menus, so every action is one click.
 */
export function OrderTableRow({
  order,
  selected,
  onToggle,
  onPatch,
  onPrint,
}: OrderTableRowProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const nextSteps = order.allowedNext ?? [];
  const first = order.items?.[0];
  const extraItems = Math.max((order.items?.length ?? 0) - 1, 0);
  const statusTint = STATUS_TINT[order.status] ?? "border-border bg-accent text-muted-foreground";
  const unpaid = order.paymentStatus !== "paid";
  const noActions = nextSteps.length === 0 && !unpaid;

  return (
    <tr
      data-state={selected ? "selected" : undefined}
      data-testid="order-table-row"
      data-orderid={order.orderId}
      className="data-[state=selected]:bg-primary/[0.03] transition-colors hover:bg-accent"
    >
      <td className="w-12 pl-5 pr-0 align-middle">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggle(order.orderId)}
          aria-label={`Select order ${orderNumberShort(order.orderNumber)}`}
          className="mt-0.5"
        />
      </td>
      <td className="w-32 px-2 py-3 align-middle" title={order.orderNumber}>
        <span className="block whitespace-nowrap text-sm font-semibold tabular-nums">
          {orderNumberShort(order.orderNumber)}
        </span>
      </td>
      <td className="w-12 px-2 py-3 align-middle">
        <div className="flex max-w-[260px] items-center gap-1.5">
          <span className="truncate text-sm">
            {first ? `${first.quantity}× ${first.name}` : "No items"}
          </span>
          {extraItems > 0 ? (
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              +{extraItems} more
            </span>
          ) : null}
        </div>
      </td>
      <td className="w-28 whitespace-nowrap px-2 py-3 align-middle text-sm tabular-nums">
        {money(order.totalMinor, order.currency)}
      </td>
      <td className="w-28 px-2 py-3 align-middle">
        <span
          className={cn(
            "inline-flex max-w-full items-center truncate whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            statusTint
          )}
        >
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </td>
      <td className="w-36 whitespace-nowrap px-2 py-3 align-middle" title={new Date(order.createdAt).toLocaleString()}>
        <span className="block text-xs text-foreground/80">
          {order.createdAt ? whenDay(order.createdAt) : ""}
        </span>
        <span className="block text-xs text-muted-foreground">
          {order.createdAt ? whenTime(order.createdAt) : ""}
        </span>
      </td>
      <td className="w-28 px-2 py-3 align-middle">
        <span
          className={cn(
            "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
            paymentTint(order.paymentStatus)
          )}
        >
          {paymentLabel(order.paymentStatus)}
        </span>
      </td>
      {/* Always-visible actions: forward steps + payment + print + details */}
      <td className="px-2 py-3 pr-5 align-middle">
        <div className="flex flex-wrap items-center justify-end gap-0.5">
          {noActions ? (
            <CheckCircle2 className="size-4 text-muted-foreground/40" aria-hidden="true" />
          ) : null}
          {nextSteps.map((step) => {
            const meta = STEP_ACTION[step] ?? { icon: Check };
            const Icon = meta.icon;
            const label = `Mark as ${STATUS_LABELS[step] ?? step}`;
            return (
              <Button
                key={step}
                variant="ghost"
                size="icon"
                className={cn(
                  "size-8 text-muted-foreground",
                  meta.destructive
                    ? "hover:bg-destructive/10 hover:text-destructive"
                    : "hover:bg-primary/10 hover:text-primary"
                )}
                title={label}
                aria-label={label}
                onClick={() => onPatch(order.orderId, { status: step })}
              >
                <Icon className="size-4" aria-hidden="true" />
              </Button>
            );
          })}
          {unpaid ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:bg-success/10 hover:text-success"
              title="Mark paid"
              aria-label={`Mark order ${orderNumberShort(order.orderNumber)} paid`}
              onClick={() => onPatch(order.orderId, { paymentStatus: "paid" })}
            >
              <CircleDollarSign className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            title="View details"
            aria-label={`View details of order ${orderNumberShort(order.orderNumber)}`}
            onClick={() => setDetailsOpen(true)}
          >
            <Eye className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-foreground"
            title="Print ticket"
            aria-label={`Print ticket for order ${orderNumberShort(order.orderNumber)}`}
            onClick={() => onPrint(order)}
          >
            <Printer className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </td>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Order {orderNumberShort(order.orderNumber)}
            </DialogTitle>
            <DialogDescription>
              {order.createdAt ? `${whenDay(order.createdAt)} ${whenTime(order.createdAt)}` : ""} ·{" "}
              {CHANNEL_LABEL[order.channel] ?? order.channel}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Full order number: </span>
              <span className="font-mono text-xs">{order.orderNumber}</span>
            </p>
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
