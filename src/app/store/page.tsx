"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface StoreItem {
  itemId: string;
  categoryId: string;
  name: string;
  description: string;
  priceMinor: number;
}
interface StoreCategory {
  categoryId: string;
  name: string;
}
interface StoreOffer {
  offerId: string;
  name: string;
  description: string;
  valueLabel: string;
  minOrderMinor: number | null;
}
interface StoreData {
  businessName: string;
  currency: string;
  categories: StoreCategory[];
  items: StoreItem[];
  offers: StoreOffer[];
  deliveryFeeMinor: number;
}
interface CartEntry {
  item: StoreItem;
  quantity: number;
}

const KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

function StoreFront() {
  const [data, setData] = useState<StoreData | null>(null);
  const [error, setError] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState("all");
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<{
    orderNumber: string;
    total: number;
    duplicate?: boolean;
  } | null>(null);
  const [orderError, setOrderError] = useState("");
  const [checkout, setCheckout] = useState({
    customerName: "",
    customerPhone: "",
    fulfilmentType: "delivery",
    address: "",
    notes: "",
  });

  const key =
    typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("key") ?? "");

  useEffect(() => {
    if (!key || !KEY_PATTERN.test(key)) {
      setError("Store link is invalid");
      return;
    }
    fetch(`/api/store?key=${encodeURIComponent(key)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((res) => setData(res.data))
      .catch(() => setError("Store not available"));
  }, [key]);

  const cartList: CartEntry[] = useMemo(() => {
    if (!data) return [];
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => ({
        item: data.items.find((i) => i.itemId === itemId)!,
        quantity: qty,
      }));
  }, [cart, data]);

  const subtotalMinor = cartList.reduce(
    (sum, c) => sum + c.item.priceMinor * c.quantity,
    0
  );

  function addToCart(itemId: string) {
    setCart((c) => ({ ...c, [itemId]: (c[itemId] ?? 0) + 1 }));
  }
  function removeFromCart(itemId: string) {
    setCart((c) => {
      const next = { ...c };
      if (!next[itemId]) return c;
      next[itemId] -= 1;
      if (next[itemId] <= 0) delete next[itemId];
      return next;
    });
  }

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !key) return;
    setPlacing(true);
    setOrderError("");
    try {
      const idempotencyId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "")
          : `${Date.now()}${Math.random().toString(36).slice(2)}`;
      const res = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          items: cartList.map((c) => ({ itemId: c.item.itemId, quantity: c.quantity })),
          customerName: checkout.customerName,
          customerPhone: checkout.customerPhone,
          fulfilmentType: checkout.fulfilmentType,
          address: checkout.address,
          notes: checkout.notes,
          idempotencyKey: idempotencyId,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setOrderError(payload?.error?.message ?? "Failed to place order");
      } else {
        setPlaced({
          orderNumber: payload.data.orderNumber,
          total: payload.data.totalMinor,
          duplicate: payload.data.duplicate,
        });
        setCart({});
      }
    } catch {
      setOrderError("Failed to place order. Please try again.");
    } finally {
      setPlacing(false);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }
  if (!data) {
    return <div className="min-h-screen" />;
  }

  const currency = data.currency ?? "PKR";
  const visibleItems =
    filter === "all"
      ? data.items
      : data.items.filter((i) => i.categoryId === filter);

  if (placed) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-md text-center">
          <CardContent className="p-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-2xl text-success">
              ✓
            </div>
            <h2 className="text-xl font-bold">Order placed!</h2>
            <p className="pt-1 text-sm text-muted-foreground">
              {placed.duplicate ? "(duplicate request ignored)" : ""} Order{" "}
              <strong>#{placed.orderNumber}</strong> received by {data.businessName}.
            </p>
            <p className="pt-2 font-semibold">
              Total: {currency} {Math.round(placed.total / 100)}
            </p>
            <Button className="mt-4" onClick={() => setPlaced(null)}>
              Back to menu
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">{data.businessName}</h1>
          {data.offers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.offers.map((offer) => (
                <Badge key={offer.offerId} variant="secondary" className="border-primary/30 bg-primary/10 text-primary">
                  {offer.name}: {offer.valueLabel}
                </Badge>
              ))}
            </div>
          )}
        </header>

        <nav aria-label="Categories" className="flex flex-wrap gap-2">
          {[{ categoryId: "all", name: "All" }, ...data.categories].map((cat) => (
            <button
              key={cat.categoryId}
              onClick={() => setFilter(cat.categoryId)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium",
                filter === cat.categoryId
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              {cat.name}
            </button>
          ))}
        </nav>

        {visibleItems.length === 0 ? (
          <Empty>
            <p>No items available right now. Please check back soon.</p>
          </Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {visibleItems.map((item) => (
              <li key={item.itemId}>
                <Card className="flex h-full flex-col justify-between">
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm">{item.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {currency} {Math.round(item.priceMinor / 100)}
                    </p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => addToCart(item.itemId)}
                      aria-label={`Add ${item.name} to cart`}
                    >
                      Add to cart
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Order</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cartList.length === 0 ? (
              <p className="text-sm text-muted-foreground">Cart is empty. Add items to order.</p>
            ) : (
              <ul className="space-y-2">
                {cartList.map((entry) => (
                  <li key={entry.item.itemId} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{entry.item.name}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        onClick={() => removeFromCart(entry.item.itemId)}
                        aria-label={`Remove one ${entry.item.name}`}
                      >
                        −
                      </Button>
                      <span className="w-6 text-center">{entry.quantity}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        onClick={() => addToCart(entry.item.itemId)}
                        aria-label={`Add one ${entry.item.name}`}
                      >
                        +
                      </Button>
                    </div>
                    <span className="w-16 text-right">
                      {currency} {Math.round((entry.item.priceMinor * entry.quantity) / 100)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-between border-t pt-2 text-sm font-semibold">
              <span>Subtotal</span>
              <span>
                {currency} {Math.round(subtotalMinor / 100)}
                {""}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Final total is confirmed by the restaurant (incl. any offers).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Checkout</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={placeOrder} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="custName">Name</Label>
                <Input
                  id="custName"
                  value={checkout.customerName}
                  onChange={(e) => setCheckout({ ...checkout, customerName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="custPhone">Phone</Label>
                <Input
                  id="custPhone"
                  type="tel"
                  placeholder="03xx-xxxxxxx"
                  value={checkout.customerPhone}
                  onChange={(e) => setCheckout({ ...checkout, customerPhone: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="custFulfil">Fulfilment</Label>
                <div className="grid grid-cols-2 gap-2">
                  {["delivery", "pickup"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setCheckout({ ...checkout, fulfilmentType: type })}
                      aria-pressed={checkout.fulfilmentType === type}
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm capitalize",
                        checkout.fulfilmentType === type
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              {checkout.fulfilmentType === "delivery" && (
                <div className="space-y-1.5">
                  <Label htmlFor="custAddr">Address</Label>
                  <Input
                    id="custAddr"
                    value={checkout.address}
                    onChange={(e) => setCheckout({ ...checkout, address: e.target.value })}
                    placeholder="Street, area, city"
                    required
                  />
                </div>
              )}
              {orderError && (
                <p className="text-sm text-destructive" role="alert">
                  {orderError}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={placing || cartList.length === 0}>
                {placing ? "Placing order..." : "Place Order (Cash on delivery)"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

export default function StorePage() {
  return <StoreFront />;
}
