"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowDown, ArrowUp, Copy, Pencil, Plus, Printer, RotateCcw, Search } from "lucide-react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty } from "@/components/ui/empty";
import { NoTenantNotice } from "@/components/dashboard/NoTenantNotice";
import { formatMoney } from "@/lib/domain/money";

interface OrderItem {
  itemId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
}
interface Order {
  orderId: string;
  orderNumber: string;
  channel: string;
  status: string;
  paymentStatus: string;
  /** Statuses the server will accept for this order right now. */
  allowedNext?: string[];
  items: OrderItem[];
  totalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  currency: string;
  appliedOffer: string | null;
  customer: { name?: string; phone?: string };
  fulfilment: { type?: string; address?: string | null };
  notes?: string;
  statusHistory?: Array<{
    from: string;
    to: string;
    by?: string;
    at?: string;
  }>;
  createdAt: string;
}

interface CartView {
  cartId: string;
  channel: string;
  status: string;
  items: Array<{ name: string; quantity: number }>;
  cartRevision: number;
  totalLabel: string | null;
  customer: { name?: string | null; phone?: string | null } | null;
  updatedAt: string;
}

const CHANNEL_LABEL: Record<string, string> = {
  web: "Website",
  whatsapp_qr: "WhatsApp",
  whatsapp_meta: "WhatsApp (Meta)",
  storefront: "Store",
};

const statusBadge: Record<string, string> = {
  received: "bg-warning/10 text-warning border-warning/30",
  confirmed: "bg-primary/10 text-primary border-primary/30",
  preparing: "bg-primary/10 text-primary border-primary/30",
  ready: "bg-primary/10 text-primary border-primary/30",
  dispatched: "bg-primary/10 text-primary border-primary/30",
  completed: "bg-success/10 text-success border-success/30",
  declined: "bg-destructive/10 text-destructive border-destructive/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  dispatched: "Dispatched",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

function printTicket(order: Order) {
  const lines = [
    `Order ${order.orderNumber}`,
    `Placed: ${new Date(order.createdAt).toLocaleString()}`,
    `Type: ${order.fulfilment?.type === "pickup" ? "Pickup" : "Delivery"}`,
    order.fulfilment?.address
      ? `Address: ${order.fulfilment.address}`
      : "",
    `Customer: ${order.customer?.name ?? ""} · ${order.customer?.phone ?? ""}`,
    "",
    ...order.items.map(
      (item) => `${item.quantity} x ${item.name} — ${formatMoney(item.unitPriceMinor * item.quantity, order.currency)}`
    ),
    "",
    `Total: ${formatMoney(order.totalMinor, order.currency)}`,
    order.appliedOffer ? `Offer: ${order.appliedOffer}` : "",
    `Payment: ${order.paymentStatus}`,
    order.notes ? `Notes: ${order.notes}` : "",
  ].filter(Boolean);

  const popup = window.open("", "_blank", "width=380,height=640");
  if (!popup) return;
  popup.document.write(
    `<pre style="font-family: ui-monospace, monospace; font-size: 13px; padding: 16px; white-space: pre-wrap;">${lines.join(
      "\n"
    )}</pre>`
  );
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 200);
}

function OrdersPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [orders, setOrders] = useState<Order[]>([]);
  const [carts, setCarts] = useState<CartView[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [newOrderCount, setNewOrderCount] = useState(0);
  const lastSeenRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/orders?tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.data?.orders ?? []);
        setCarts(data.data?.carts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  // New-order alerts: poll quietly and count unseen orders.
  useEffect(() => {
    if (!tenantId) return;
    const tick = async () => {
      try {
        const res = await authFetch(`/api/orders?tenantId=${tenantId}`);
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.data?.orders ?? []) as Order[];
        const newest = list[0]?.createdAt ?? null;
        if (lastSeenRef.current === null) {
          lastSeenRef.current = newest;
          return;
        }
        if (newest && newest !== lastSeenRef.current) {
          const unseen = list.filter(
            (order) =>
              order.status === "received" &&
              order.createdAt &&
              order.createdAt > lastSeenRef.current!
          );
          if (unseen.length > 0) {
            setNewOrderCount((count) => count + unseen.length);
          }
          lastSeenRef.current = newest;
        }
      } catch {
        // polling is best effort
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 30000);
    return () => clearInterval(timer);
  }, [tenantId]);

  async function patchOrder(orderId: string, patch: Record<string, unknown>) {
    if (!tenantId) return;
    setActionError("");
    const res = await authFetch("/api/orders", {
      method: "PATCH",
      body: JSON.stringify({ tenantId, orderId, ...patch }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      setActionError(
        payload?.error?.message ?? "That change could not be saved. Please try again."
      );
      return;
    }
    await load();
  }

  const filtered = useMemo(() => {
    if (!tenantId) return [];
    const needle = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter !== "all" && order.status !== filter) return false;
      if (!needle) return true;
      const haystack = [
        order.orderNumber,
        order.customer?.name ?? "",
        order.customer?.phone ?? "",
        ...(order.items ?? []).map((item) => item.name ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [orders, filter, search, tenantId]);

  if (!tenantId) return <NoTenantNotice />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Orders from your storefront. Confirm status and payment tracking here.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {["all", "received", "confirmed", "preparing", "ready", "dispatched", "completed", "cancelled"].map(
          (f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${
                filter === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              {f}
            </button>
          )
        )}
      </div>

      {carts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              In progress ({carts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {carts.map((cart) => (
                <li key={cart.cartId} className="flex flex-wrap items-center gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {cart.items.map((i) => `${i.quantity}x ${i.name}`).join(", ") ||
                        "Empty cart"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cart.customer?.name ?? "Guest"} ·{" "}
                      {CHANNEL_LABEL[cart.channel] ?? cart.channel} · revision{" "}
                      {cart.cartRevision} ·{" "}
                      {new Date(cart.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant="outline">{cart.status}</Badge>
                  {cart.totalLabel && (
                    <Badge variant="secondary">{cart.totalLabel}</Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>
              Orders ({filtered.length})
              {newOrderCount > 0 ? (
                <Badge variant="default" className="ml-2">
                  {newOrderCount} new
                </Badge>
              ) : null}
            </span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order number, customer or item"
              aria-label="Search orders"
              className="sm:max-w-xs"
            />
          </div>
          {actionError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Could not update the order</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          ) : null}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading orders...</p>
          ) : filtered.length === 0 ? (
            <Empty>
              <p>No orders {filter === "all" ? "yet" : `with status "${filter}"`}.</p>
              <p className="text-xs text-muted-foreground">
                Share your store link so customers can order.
              </p>
            </Empty>
          ) : (
            <ul className="divide-y">
              {filtered.map((order) => (
                <li key={order.orderId} className="py-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">#{order.orderNumber}</p>
                        <Badge variant="outline">
                          {CHANNEL_LABEL[order.channel] ?? order.channel}
                        </Badge>
                        <Badge variant="secondary" className={statusBadge[order.status]}>
                          {order.status}
                        </Badge>
                        <Badge variant={order.paymentStatus === "paid" ? "default" : "outline"}>
                          {order.paymentStatus === "paid" ? "PAID" : order.paymentStatus}
                        </Badge>
                      </div>
                      <p className="pt-1 text-xs text-muted-foreground">
                        {order.customer.name} · {order.customer.phone} ·{" "}
                        {order.fulfilment?.type === "delivery"
                          ? `Delivery: ${order.fulfilment.address}`
                          : "Pickup"}{" "}
                        · {new Date(order.createdAt).toLocaleString()}
                      </p>
                      <ul className="pt-2 text-sm">
                        {order.items.map((item) => (
                          <li key={item.itemId}>
                            {item.quantity}× {item.name}
                          </li>
                        ))}
                      </ul>
                      <p className="pt-1 text-sm font-medium">
                        Total: {order.currency}{" "}
                        {(order.totalMinor / 100).toFixed(0)}
                        {order.discountMinor ? (
                          <span className="text-success">
                            {" "}
                            (saved {Math.round(order.discountMinor / 100)})
                          </span>
                        ) : null}
                      </p>
                      {order.appliedOffer && (
                        <p className="text-xs text-muted-foreground">Offer: {order.appliedOffer}</p>
                      )}
                      {order.notes ? (
                        <p className="pt-1 text-xs text-muted-foreground">Note: {order.notes}</p>
                      ) : null}
                      {order.statusHistory && order.statusHistory.length > 0 ? (
                        <p className="pt-1 text-[11px] text-muted-foreground">
                          {order.statusHistory
                            .map(
                              (entry) =>
                                `${entry.from} → ${entry.to}${
                                  entry.at
                                    ? ` (${new Date(entry.at).toLocaleString()})`
                                    : ""
                                }`
                            )
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {(order.allowedNext ?? []).map((nextStatus) => (
                        <Button
                          key={nextStatus}
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            patchOrder(order.orderId, { status: nextStatus })
                          }
                        >
                          {STATUS_LABELS[nextStatus] ?? nextStatus}
                        </Button>
                      ))}
                      {order.paymentStatus !== "paid" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            patchOrder(order.orderId, { paymentStatus: "paid" })
                          }
                        >
                          Mark paid
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => printTicket(order)}
                      >
                        <Printer data-icon="inline-start" />
                        Print
                      </Button>
                      {order.paymentStatus !== "paid" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => patchOrder(order.orderId, { paymentStatus: "paid" })}
                          >
                            Mark Paid
                          </Button>
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 rounded-full ${
                              order.paymentStatus === "unpaid" ? "bg-warning" : "bg-destructive"
                            }`}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Page() {
  return <OrdersPage />;
}
