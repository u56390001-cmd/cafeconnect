"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { NoTenantNotice } from "@/components/dashboard/NoTenantNotice";

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
  items: OrderItem[];
  totalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  currency: string;
  appliedOffer: string | null;
  customer: { name?: string; phone?: string };
  fulfilment: { type?: string; address?: string | null };
  notes?: string;
  createdAt: string;
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

const NEXT_ACTIONS: Record<string, Array<{ label: string; status: string }>> = {
  received: [
    { label: "Confirm", status: "confirmed" },
    { label: "Decline", status: "declined" },
  ],
  confirmed: [{ label: "Preparing", status: "preparing" }],
  preparing: [{ label: "Ready", status: "ready" }],
  ready: [{ label: "Dispatched", status: "dispatched" }],
  dispatched: [{ label: "Complete", status: "completed" }],
};

function OrdersPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/orders?tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.data?.orders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchOrder(orderId: string, patch: Record<string, unknown>) {
    if (!tenantId) return;
    const res = await authFetch("/api/orders", {
      method: "PATCH",
      body: JSON.stringify({ tenantId, orderId, ...patch }),
    });
    if (res.ok) {
      setOrders((os) => os.map((o) => (o.orderId === orderId ? { ...o, ...patch } as Order : o)));
    }
  }

  const filtered = useMemo(() => {
    if (!tenantId) return [];
    if (filter === "all") return orders;
    return orders.filter((o) => o.status === filter);
  }, [orders, filter, tenantId]);

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
        {["all", "received", "confirmed", "preparing", "completed", "cancelled"].map((f) => (
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
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>
              Orders ({filtered.length})
            </span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {NEXT_ACTIONS[order.status]?.map((action) => (
                        <Button
                          key={action.status}
                          size="sm"
                          variant="outline"
                          onClick={() => patchOrder(order.orderId, { status: action.status })}
                        >
                          {action.label}
                        </Button>
                      ))}
                      {(order.status === "received" || order.status === "confirmed") && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => patchOrder(order.orderId, { status: "cancelled" })}
                        >
                          Cancel
                        </Button>
                      )}
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
