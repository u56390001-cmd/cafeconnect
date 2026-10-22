"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import {
  CartSheet,
  type CartLine,
  type CheckoutDetails,
  type QuoteResult,
} from "@/components/store/CartSheet";
import { formatMoney } from "@/lib/domain/money";
import { normalizePhone } from "@/lib/domain/phone";
import type { StoreCatalog, StoreItem } from "./types";

const CART_STORAGE_KEY = "cc_store_cart_v1";
const MAX_LINES = 20;
const MAX_QUANTITY = 20;

interface PersistedCart {
  key: string;
  lines: CartLine[];
  details: CheckoutDetails;
  fulfilmentType: "delivery" | "pickup";
  idempotencyKey: string;
  revision: number;
}

const emptyDetails: CheckoutDetails = {
  customerName: "",
  customerPhone: "",
  area: "",
  house: "",
  landmark: "",
  notes: "",
};

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `sk_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  }
  return `sk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function readPersistedCart(key: string): PersistedCart | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedCart;
    if (!parsed || parsed.key !== key) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedCart(cart: PersistedCart): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // storage unavailable - the cart still works for this visit
  }
}

export default function StorePage() {
  const [storeKey, setStoreKey] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<StoreCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [details, setDetails] = useState<CheckoutDetails>(emptyDetails);
  const [fulfilmentType, setFulfilmentType] = useState<"delivery" | "pickup">("delivery");
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [revision, setRevision] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState<{ orderNumber: string; totalLabel: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // Resolve the store key from the URL, then load the catalogue.
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("key") ?? "";
    if (!/^[A-Za-z0-9_-]+$/.test(key)) {
      setLoadError("This menu link is not valid.");
      setLoading(false);
      return;
    }
    setStoreKey(key);
  }, []);

  useEffect(() => {
    if (!storeKey) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/store?key=${encodeURIComponent(storeKey)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("menu");
        return res.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const data = payload.data as StoreCatalog;
        setCatalog(data);
        const saved = readPersistedCart(storeKey);
        if (saved) {
          setLines(saved.lines ?? []);
          setDetails({ ...emptyDetails, ...(saved.details ?? {}) });
          setFulfilmentType(saved.fulfilmentType ?? "delivery");
          setIdempotencyKey(saved.idempotencyKey || newIdempotencyKey());
          setRevision(saved.revision ?? 0);
        } else {
          setIdempotencyKey(newIdempotencyKey());
        }
        setLoadError("");
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("This menu is not available right now. Please try again later.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeKey]);

  // Persist the cart (and keep the idempotency key stable for this revision).
  useEffect(() => {
    if (!storeKey) return;
    writePersistedCart({
      key: storeKey,
      lines,
      details,
      fulfilmentType,
      idempotencyKey: idempotencyKey || newIdempotencyKey(),
      revision,
    });
  }, [storeKey, lines, details, fulfilmentType, idempotencyKey, revision]);

  const visibleItems = useMemo(() => {
    if (!catalog) return [];
    const needle = query.trim().toLowerCase();
    return catalog.items.filter((item) => {
      if (category !== "all" && item.categoryId !== category) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle)
      );
    });
  }, [catalog, query, category]);

  const subtotalMinor = useMemo(() => {
    if (!catalog) return 0;
    return lines.reduce((sum, line) => {
      const item = catalog.items.find((i) => i.itemId === line.itemId);
      return sum + (item ? item.priceMinor * line.quantity : 0);
    }, 0);
  }, [catalog, lines]);

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
  }, []);

  const changeQuantity = useCallback(
    (itemId: string, quantity: number) => {
      setLines((current) => {
        const next = current
          .map((line) =>
            line.itemId === itemId
              ? { ...line, quantity: Math.max(0, Math.min(MAX_QUANTITY, quantity)) }
              : line
          )
          .filter((line) => line.quantity > 0);
        const item = catalog?.items.find((i) => i.itemId === itemId);
        if (quantity > 0 && item) {
          announce(`${item.name} quantity ${quantity}`);
        }
        return next;
      });
      // A cart change invalidates the previous quote and the idempotency key.
      setQuote(null);
      setRevision((r) => r + 1);
      setIdempotencyKey(newIdempotencyKey());
    },
    [announce, catalog]
  );

  const removeLine = useCallback(
    (itemId: string) => {
      setLines((current) => current.filter((line) => line.itemId !== itemId));
      setQuote(null);
      setRevision((r) => r + 1);
      setIdempotencyKey(newIdempotencyKey());
      announce("Item removed from your cart");
    },
    [announce]
  );

  const addItem = useCallback(
    (item: StoreItem) => {
      setLines((current) => {
        const existing = current.find((line) => line.itemId === item.itemId);
        if (existing) {
          return current.map((line) =>
            line.itemId === item.itemId
              ? {
                  ...line,
                  quantity: Math.min(MAX_QUANTITY, line.quantity + 1),
                }
              : line
          );
        }
        if (current.length >= MAX_LINES) return current;
        return [...current, { itemId: item.itemId, quantity: 1 }];
      });
      setQuote(null);
      setRevision((r) => r + 1);
      setIdempotencyKey(newIdempotencyKey());
      announce(`${item.name} added to your cart`);
    },
    [announce]
  );

  // Server-authoritative quote whenever the cart or fulfilment changes.
  const refreshQuote = useCallback(async () => {
    if (!storeKey || lines.length === 0) {
      setQuote(null);
      return;
    }
    try {
      const res = await fetch("/api/store/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: storeKey,
          items: lines,
          fulfilmentType,
          address:
            fulfilmentType === "delivery"
              ? [details.area, details.house, details.landmark]
                  .filter(Boolean)
                  .join(", ")
              : undefined,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setQuote(null);
        setQuoteError(
          payload?.error?.message ??
            "We could not update the total. Please try again."
        );
        return;
      }
      setQuote(payload.data as QuoteResult);
      setQuoteError(null);
    } catch {
      setQuoteError("We could not update the total. Please try again.");
    }
  }, [storeKey, lines, fulfilmentType, details.area, details.house, details.landmark]);

  useEffect(() => {
    if (!cartOpen) return;
    void refreshQuote();
  }, [cartOpen, refreshQuote]);

  const submitOrder = useCallback(async () => {
    if (!storeKey || !catalog) return;
    setFieldError(null);

    if (!details.customerName.trim()) {
      setFieldError("Please enter your name.");
      return;
    }
    const phone = normalizePhone(details.customerPhone);
    if (!phone.ok) {
      setFieldError(phone.error ?? "Enter a valid phone number.");
      return;
    }
    if (fulfilmentType === "delivery") {
      const address = [details.area, details.house, details.landmark]
        .filter(Boolean)
        .join(", ");
      if (address.trim().length < 8) {
        setFieldError("Please add your area and house or street number.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: storeKey,
          items: lines,
          customerName: details.customerName.trim(),
          customerPhone: phone.normalized,
          fulfilmentType,
          address:
            fulfilmentType === "delivery"
              ? [details.area, details.house, details.landmark]
                  .filter(Boolean)
                  .join(", ")
              : undefined,
          notes: details.notes,
          idempotencyKey,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setFieldError(
          payload?.error?.message ??
            "We could not place the order. Please try again."
        );
        return;
      }
      setPlaced({
        orderNumber: payload.data.orderNumber,
        totalLabel: formatMoney(payload.data.totalMinor, catalog.currency),
      });
      setLines([]);
      setDetails(emptyDetails);
      setQuote(null);
      setCartOpen(false);
      try {
        window.localStorage.removeItem(CART_STORAGE_KEY);
      } catch {
        // ignore storage failures
      }
    } catch {
      setFieldError(
        "We could not reach the restaurant. Your cart is saved — please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }, [storeKey, catalog, details, fulfilmentType, lines, idempotencyKey]);

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center px-4">
        <Alert variant="destructive" className="w-full">
          <AlertTitle>Menu unavailable</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </main>
    );
  }

  if (placed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold">Order received</h1>
        <p className="text-sm text-muted-foreground">
          Your order number is{" "}
          <span className="font-medium text-foreground">
            {placed.orderNumber}
          </span>{" "}
          · total {placed.totalLabel}
        </p>
        <p className="text-sm text-muted-foreground">
          The restaurant will call you to confirm the order.
        </p>
        <Button onClick={() => setPlaced(null)}>Back to menu</Button>
      </main>
    );
  }

  const currency = catalog?.currency ?? "PKR";
  const totalMinor = quote?.totalMinor ?? subtotalMinor + (catalog?.deliveryFeeMinor ?? 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 px-4 pb-28 pt-5 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {catalog?.businessName ?? "Menu"}
        </h1>
        {catalog?.deliveryAreaLabel ? (
          <p className="text-sm text-muted-foreground">
            Delivering to {catalog.deliveryAreaLabel}
          </p>
        ) : null}
        {catalog?.orderInstructions ? (
          <p className="text-sm text-muted-foreground">
            {catalog.orderInstructions}
          </p>
        ) : null}
      </header>

      {catalog && catalog.offers.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {catalog.offers.map((offer) => (
            <Badge key={offer.offerId} variant="secondary" className="py-1">
              {offer.name} · {offer.valueLabel}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the menu"
            aria-label="Search the menu"
            className="pl-9"
          />
        </div>
        {catalog && catalog.categories.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[{ categoryId: "all", name: "All" }, ...catalog.categories].map(
              (cat) => (
                <Button
                  key={cat.categoryId}
                  size="sm"
                  variant={category === cat.categoryId ? "default" : "outline"}
                  onClick={() => setCategory(cat.categoryId)}
                >
                  {cat.name}
                </Button>
              )
            )}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        <Empty className="rounded-lg border border-dashed border-border">
          <p>Nothing matches that search.</p>
          <p className="text-xs text-muted-foreground">
            Try a different word, or ask the restaurant for what is available
            today.
          </p>
        </Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visibleItems.map((item) => {
            const line = lines.find((l) => l.itemId === item.itemId);
            return (
              <li
                key={item.itemId}
                className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{item.name}</p>
                    <p className="shrink-0 font-medium tabular-nums">
                      {formatMoney(item.priceMinor, currency)}
                    </p>
                  </div>
                  {item.description ? (
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {line ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          changeQuantity(item.itemId, line.quantity - 1)
                        }
                      >
                        −
                      </Button>
                      <span className="w-6 text-center text-sm tabular-nums">
                        {line.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          changeQuantity(item.itemId, line.quantity + 1)
                        }
                      >
                        +
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => addItem(item)}>
                      Add
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {itemCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatMoney(totalMinor, currency)}
              </p>
            </div>
            <Button onClick={() => setCartOpen(true)}>
              <ShoppingBag data-icon="inline-start" />
              View cart
            </Button>
          </div>
        </div>
      ) : null}

      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        items={catalog?.items ?? []}
        lines={lines}
        currency={currency}
        deliveryFeeMinor={catalog?.deliveryFeeMinor ?? 0}
        minimumOrderMinor={catalog?.minimumOrderMinor ?? 0}
        pickupAvailable={catalog?.pickupAvailable ?? true}
        paymentMethods={catalog?.paymentMethods ?? "Cash on delivery"}
        fulfilmentType={fulfilmentType}
        onFulfilmentChange={setFulfilmentType}
        onQuantityChange={changeQuantity}
        onRemove={removeLine}
        subtotalMinor={subtotalMinor}
        quote={quote}
        quoteError={quoteError}
        details={details}
        onDetailsChange={setDetails}
        fieldError={fieldError}
        submitting={submitting}
        onSubmit={() => void submitOrder()}
      />
    </main>
  );
}
