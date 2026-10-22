"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/domain/money";
import {
  displayDeltaMinor,
  optionText,
  type PosLine,
  type QuoteState,
} from "@/lib/pos/types";

interface OrderPanelProps {
  fulfilments: Array<{ value: "delivery" | "pickup"; label: string }>;
  fulfilmentType: "delivery" | "pickup";
  onFulfilmentTypeChange: (type: "delivery" | "pickup") => void;
  currency: string;
  lines: PosLine[];
  quote: QuoteState;
  recentOrders: PosRecentOrder[];
  busy: "kot" | "bill" | "billPrint" | null;
  paymentEnabled: boolean;
  onSetQuantity: (lineId: string, quantity: number) => void;
  onRemoveLine: (lineId: string) => void;
  onConfigure: (lineId: string) => void;
  onSetNote: (lineId: string, note: string) => void;
  onKot: () => void;
  onDraft: () => void;
  onBill: () => void;
  onBillPrint: () => void;
}

export interface PosRecentOrder {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  customer: { name?: string; phone?: string };
  items: Array<{ name: string; quantity: number; note?: string; options?: unknown[] }>;
  totalMinor: number;
  createdAt: string;
}

/**
 * The order being taken at the counter. Quantities, notes and option changes
 * are local edits; every total comes from the quote API, so the panel can
 * only display money the pricing engine confirmed.
 */
export function OrderPanel(props: OrderPanelProps) {
  const {
    fulfilments,
    fulfilmentType,
    onFulfilmentTypeChange,
    currency,
    lines,
    quote,
    recentOrders,
    busy,
    paymentEnabled,
    onSetQuantity,
    onRemoveLine,
    onConfigure,
    onSetNote,
    onKot,
    onDraft,
    onBill,
    onBillPrint,
  } = props;

  const [recentSearch, setRecentSearch] = useState("");
  const [showRecent, setShowRecent] = useState(false);

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const hasLines = lines.length > 0;
  const canPlace = hasLines && !busy && !quote.loading && quote.blockedReason === null;

  const matchingRecent = recentOrders.filter((order) => {
    const q = recentSearch.trim().toLowerCase();
    if (q === "") return true;
    return (
      order.orderNumber.toLowerCase().includes(q) ||
      (order.customer.name ?? "").toLowerCase().includes(q) ||
      (order.customer.phone ?? "").includes(q) ||
      order.items.some((item) => item.name.toLowerCase().includes(q))
    );
  });

  return (
    <aside className="flex h-full min-h-0 flex-col gap-3" aria-label="Current order">
      <div className="flex items-center gap-2">
        {fulfilments.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onFulfilmentTypeChange(option.value)}
            aria-pressed={fulfilmentType === option.value}
            className={cn(
              "h-8 flex-1 rounded-full border text-xs font-medium transition-colors",
              fulfilmentType === option.value
                ? "border-transparent bg-orange-600 text-white"
                : "bg-white text-foreground hover:bg-muted"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="search"
          value={recentSearch}
          onChange={(event) => setRecentSearch(event.target.value)}
          onFocus={() => setShowRecent(true)}
          placeholder="Search in existing orders…"
          aria-label="Search previous orders"
          className="h-9 flex-1"
        />
        <Badge variant={hasLines ? "default" : "secondary"} className={hasLines ? "bg-orange-600" : ""}>
          {hasLines ? `${itemCount} items` : "New"}
        </Badge>
      </div>

      {showRecent && recentOrders.length > 0 && (
        <div className="max-h-44 overflow-y-auto rounded-md border bg-white p-1.5 shadow-sm">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              Recent POS orders
            </span>
            <button
              type="button"
              onClick={() => setShowRecent(false)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          {matchingRecent.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">No matching orders.</p>
          ) : (
            <ul className="space-y-0.5">
              {matchingRecent.slice(0, 8).map((order) => (
                <li key={order.orderId}>
                  <div className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{order.orderNumber}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {order.customer.name ?? "Walk-in"} · {order.items.length} items ·{" "}
                        {formatMoney(order.totalMinor, currency)}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {order.paymentStatus}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1">
        {hasLines ? (
          <ul className="space-y-2 pb-2">
            {lines.map((line) => (
              <li key={line.lineId} className="rounded-lg border bg-white p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    {(line.resolved ?? []).length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {line.resolved!
                          .map((r) => `${r.groupName}: ${r.optionNames.join(", ")}`)
                          .join(" · ")}
                        {displayDeltaMinor(line.optionGroups, line.selections) !== 0 && (
                          <span className="text-orange-600">
                            {" "}
                            +{formatMoney(displayDeltaMinor(line.optionGroups, line.selections), currency)}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="shrink-0 tabular-nums">
                    {formatMoney(line.basePriceMinor * line.quantity, currency)}
                  </Badge>
                </div>

                <NoteInput note={line.note} onSetNote={(note) => onSetNote(line.lineId, note)} />

                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1" role="group" aria-label={`Quantity for ${line.name}`}>
                    <QtyButton
                      label="Decrease quantity"
                      disabled={line.quantity <= 1}
                      onClick={() => onSetQuantity(line.lineId, line.quantity - 1)}
                    >
                      −
                    </QtyButton>
                    <span className="w-7 text-center text-sm tabular-nums">{line.quantity}</span>
                    <QtyButton
                      label="Increase quantity"
                      disabled={line.quantity >= 20}
                      onClick={() => onSetQuantity(line.lineId, line.quantity + 1)}
                    >
                      +
                    </QtyButton>
                  </div>
                  <div className="flex items-center gap-1">
                    {line.optionGroups.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => onConfigure(line.lineId)}
                      >
                        Edit options
                      </Button>
                    )}
                    <QtyButton
                      label={`Remove ${line.name}`}
                      onClick={() => onRemoveLine(line.lineId)}
                      destructive
                    >
                      🗑
                    </QtyButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full min-h-32 items-center justify-center rounded-lg border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
            Tap a product to start the order.
          </div>
        )}
      </div>

      <Totals quote={quote} currency={currency} hasLines={hasLines} />

      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={onKot}
          disabled={!canPlace}
          className="bg-gray-900 text-white hover:bg-gray-800"
        >
          {busy === "kot" ? "Sending…" : "KOT & Print"}
        </Button>
        <Button variant="outline" onClick={onDraft} disabled={busy !== null}>
          {busy !== null ? "Working…" : "Draft"}
        </Button>
        <Button
          onClick={onBill}
          disabled={!canPlace}
          className="bg-orange-600 hover:bg-orange-700"
        >
          Bill & Payment
        </Button>
        <Button
          onClick={onBillPrint}
          disabled={!canPlace}
          className="bg-green-600 hover:bg-green-700"
        >
          Bill & Print
        </Button>
      </div>
      {!paymentEnabled && (
        <p className="text-center text-[11px] text-muted-foreground">
          Payment marking needs a manager. Staff can still send KOT and draft the
          order.
        </p>
      )}
    </aside>
  );
}

function NoteInput({
  note,
  onSetNote,
}: {
  note: string;
  onSetNote: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note);
  const [dirty, setDirty] = useState(false);

  if (!editing) {
    if (note) {
      return (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-1 block w-full rounded bg-amber-50 px-2 py-1 text-left text-[11px] text-amber-800 hover:bg-amber-100"
        >
          Note: {note}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => {
          setValue("");
          setEditing(true);
        }}
        className="mt-1 block w-full text-left text-[11px] text-blue-600 hover:underline"
      >
        + Add note
      </button>
    );
  }
  return (
    <form
      className="mt-1 flex gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        onSetNote(value);
        setEditing(false);
        setDirty(false);
      }}
    >
      <Input
        autoFocus
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setDirty(true);
        }}
        maxLength={200}
        placeholder="Kitchen note"
        aria-label="Kitchen note"
        className="h-8 text-xs"
      />
      <Button type="submit" size="sm" className="h-8 px-2 text-xs">
        Save
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 px-2 text-xs"
        onClick={() => {
          if (dirty) onSetNote("");
          setValue(note);
          setDirty(false);
          setEditing(false);
        }}
      >
        Clear
      </Button>
    </form>
  );
}

function QtyButton({
  children,
  label,
  onClick,
  disabled,
  destructive,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "h-7 w-7 p-0 text-xs",
        destructive && "text-red-600 hover:bg-red-50 hover:text-red-700"
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {children}
    </Button>
  );
}

function Totals({
  quote,
  currency,
  hasLines,
}: {
  quote: QuoteState;
  currency: string;
  hasLines: boolean;
}) {
  return (
    <div className="rounded-lg border bg-white p-3 text-sm">
      {quote.blockedReason && (
        <p className="mb-1 text-[11px] font-medium text-red-600">{quote.blockedReason}</p>
      )}
      {quote.loading ? (
        <p className="animate-pulse text-muted-foreground" role="status">
          Updating total…
        </p>
      ) : (
        <>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{formatMoney(quote.subtotalMinor, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Discount{quote.appliedOfferName ? ` (${quote.appliedOfferName})` : ""}
            </span>
            <span className="tabular-nums">{quote.discountMinor > 0 ? `−${formatMoney(quote.discountMinor, currency)}` : formatMoney(0, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Delivery</span>
            <span className="tabular-nums">{formatMoney(quote.deliveryFeeMinor, currency)}</span>
          </div>
          <Separator className="my-1.5" />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(quote.totalMinor, currency)}</span>
          </div>
          {hasLines && quote.minimumOrderMinor !== null && quote.subtotalMinor < quote.minimumOrderMinor && (
            <p className="mt-1 text-[11px] text-red-600">
              Minimum order is {formatMoney(quote.minimumOrderMinor, currency)}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
