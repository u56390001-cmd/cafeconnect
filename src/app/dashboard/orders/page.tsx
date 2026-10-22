"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, ShoppingCart } from "lucide-react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty } from "@/components/ui/empty";
import { NoTenantNotice } from "@/components/dashboard/NoTenantNotice";
import { PageHeader } from "@/components/dashboard/page-header";
import { printBill } from "@/lib/print/receipt";
import { OrderStatusRail, type StatusFilter } from "@/components/orders/order-status-rail";
import { OrderRow } from "@/components/orders/order-row";
import { CHANNEL_LABEL, STATUS_LABELS, type CartView, type Order } from "@/components/orders/types";
import { cn } from "@/lib/utils";

function printTicket(order: Order) {
  printBill({
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    fulfilmentType: order.fulfilment?.type === "pickup" ? "pickup" : "delivery",
    address: order.fulfilment?.address ?? null,
    customerName: order.customer?.name,
    customerPhone: order.customer?.phone,
    notes: order.notes,
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      lineTotalMinor: item.unitPriceMinor * item.quantity,
      options: item.options ?? [],
    })),
    subtotalMinor: order.totalMinor - order.discountMinor - order.deliveryFeeMinor,
    discountMinor: order.discountMinor,
    deliveryFeeMinor: order.deliveryFeeMinor,
    totalMinor: order.totalMinor,
    currency: order.currency,
    appliedOffer: order.appliedOffer ?? null,
    paymentStatus: order.paymentStatus,
  });
}

function OrdersPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [orders, setOrders] = useState<Order[]>([]);
  const [carts, setCarts] = useState<CartView[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [showCarts, setShowCarts] = useState(false);
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
        setLoadError("");
      } else {
        setLoadError("Orders could not be loaded. Please try again.");
      }
    } catch {
      setLoadError("Orders could not be loaded. Please try again.");
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

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: orders.length };
    for (const order of orders) {
      map[order.status] = (map[order.status] ?? 0) + 1;
    }
    return map;
  }, [orders]);

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

  const activeCarts = carts.filter((cart) => cart.items.length > 0);
  const emptyCarts = carts.length - activeCarts.length;
  const usefulCarts = activeCarts.slice(0, 6);

  if (!tenantId) return <NoTenantNotice />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Move each order through the pipeline and keep payment status current."
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Stage rail: filters + in-progress carts */}
        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div>
            <p className="mb-2 hidden text-xs font-medium text-muted-foreground lg:block">
              Pipeline
            </p>
            <OrderStatusRail counts={counts} active={filter} onChange={setFilter} />
          </div>

          {carts.length > 0 && (
            <div className="hidden lg:block">
              <button
                type="button"
                onClick={() => setShowCarts((open) => !open)}
                aria-expanded={showCarts}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ShoppingCart className="text-muted-foreground" size={16} aria-hidden="true" />
                Carts in progress
                <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[11px] tabular-nums text-foreground">
                  {carts.length}
                </span>
              </button>
              {showCarts && (
                <div className="mt-1 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-2">
                  {usefulCarts.map((cart) => (
                    <div key={cart.cartId} className="rounded-md px-2 py-1.5 text-xs">
                      <p className="truncate font-medium">
                        {cart.customer?.name || "Guest"}
                        <span className="font-normal text-muted-foreground">
                          {" · "}
                          {CHANNEL_LABEL[cart.channel] ?? cart.channel}
                        </span>
                      </p>
                      <p className="truncate text-muted-foreground">
                        {cart.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {cart.status.replace(/_/g, " ")}
                        {cart.totalLabel ? ` · ${cart.totalLabel}` : ""}
                      </p>
                    </div>
                  ))}
                  {emptyCarts > 0 && (
                    <p className="px-2 py-1 text-[11px] text-muted-foreground/70">
                      …and {emptyCarts} empty {emptyCarts === 1 ? "cart" : "carts"}
                    </p>
                  )}
                  {activeCarts.length > usefulCarts.length && (
                    <p className="px-2 py-1 text-[11px] text-muted-foreground">
                      Showing {usefulCarts.length} of {activeCarts.length} filled carts
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Order list for the selected stage */}
        <section className="min-w-0 space-y-4" aria-label="Orders list">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order, customer or item"
                aria-label="Search orders"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              {newOrderCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFilter("received");
                    setNewOrderCount(0);
                  }}
                  className="border-warning/30 bg-warning/10 text-warning hover:bg-warning/20 hover:text-warning"
                >
                  {newOrderCount} new
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => void load()}>
                Refresh
              </Button>
            </div>
          </div>

          {actionError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not update the order</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          ) : null}
          {loadError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load orders</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <ul className="space-y-3" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, index) => (
                <li key={index} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16 rounded-full" />
                    <Skeleton className="ml-auto h-4 w-14" />
                  </div>
                  <Skeleton className="mt-3 h-3.5 w-64" />
                  <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="ml-auto h-7 w-20" />
                    <Skeleton className="h-7 w-16" />
                  </div>
                </li>
              ))}
            </ul>
          ) : filtered.length === 0 ? (
            <Empty className="rounded-lg border border-dashed border-border">
              <p>
                {filter === "all"
                  ? "No orders yet."
                  : `No orders in the ${STATUS_LABELS[filter] ?? filter} stage.`}
              </p>
              <p className="text-xs text-muted-foreground">
                {filter === "all"
                  ? "Share your store link so customers can order."
                  : "Try another stage from the pipeline or clear the search."}
              </p>
            </Empty>
          ) : (
            <ul className="space-y-3">
              {filtered.map((order) => (
                <OrderRow
                  key={order.orderId}
                  order={order}
                  onPatch={patchOrder}
                  onPrint={printTicket}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default function Page() {
  return <OrdersPage />;
}
