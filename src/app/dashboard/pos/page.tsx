"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatMoney } from "@/lib/domain/money";
import { extractApiErrorMessage } from "@/lib/api/error-message";
import {
  optionGroupsOf,
  type ItemSelection,
} from "@/lib/domain/options";
import { ProductGrid } from "@/components/pos/product-grid";
import {
  OrderPanel,
  type PosRecentOrder,
} from "@/components/pos/order-panel";
import { ItemOptionsSheet } from "@/components/pos/item-options-sheet";
import {
  CustomerSheet,
  type CustomerDetails,
} from "@/components/pos/customer-sheet";
import { PaymentSheet } from "@/components/pos/payment-sheet";
import { DraftListSheet } from "@/components/pos/draft-list-sheet";
import {
  activeOptionGroups,
  displayResolved,
  EMPTY_QUOTE,
  nextLineId,
  type PosCategory,
  type PosDraftSummary,
  type PosLine,
  type PosMenuItem,
  type QuoteState,
} from "@/lib/pos/types";
import { printBill, printKot } from "@/lib/print/receipt";

type PendingIntent = "kot" | "billPay" | "billPrint" | null;

interface PosSettings {
  businessName: string;
  currency: string;
  pickupAvailable: boolean;
  paymentMethods: string;
  canCollectPayment: boolean;
}

const DEFAULT_CUSTOMER: CustomerDetails = {
  customerName: "",
  customerPhone: "",
  fulfilmentType: "pickup",
  address: "",
  notes: "",
};

/**
 * Point of sale. The browser owns order taking - lines, notes, quantities -
 * but never a price: every total is quoted by the pricing engine and the
 * final order is created by the same `createOrder` service as online orders.
 */
export default function PosPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? null;

  const [items, setItems] = useState<PosMenuItem[]>([]);
  const [categories, setCategories] = useState<PosCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState<PosSettings | null>(null);
  const [recentOrders, setRecentOrders] = useState<PosRecentOrder[]>([]);
  const [drafts, setDrafts] = useState<PosDraftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [lines, setLines] = useState<PosLine[]>([]);
  const [quote, setQuote] = useState<QuoteState>(EMPTY_QUOTE);
  const [customer, setCustomer] = useState<CustomerDetails>(DEFAULT_CUSTOMER);
  const [fulfilmentType, setFulfilmentType] = useState<"delivery" | "pickup">(
    "pickup"
  );

  const [itemForSheet, setItemForSheet] = useState<PosMenuItem | null>(null);
  const [lineForSheet, setLineForSheet] = useState<string | null>(null);
  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [draftSheetOpen, setDraftSheetOpen] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<PendingIntent>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState<"kot" | "bill" | "billPrint" | null>(null);

  const quoteAbort = useRef<AbortController | null>(null);
  const currency = settings?.currency ?? "PKR";

  /* ---------------- Load: menu + settings + recent orders ---------------- */
  useEffect(() => {
    if (!tenantId) {
      setError("No restaurant is linked to your account. Ask the owner for access.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [itemsRes, categoriesRes, recentRes] = await Promise.all([
          authFetch(`/api/menu/items?tenantId=${tenantId}`),
          authFetch(`/api/menu/categories?tenantId=${tenantId}`),
          authFetch(`/api/pos/orders?tenantId=${tenantId}`),
        ]);
        if (!itemsRes.ok || !categoriesRes.ok) {
          throw new Error("menu");
        }
        const itemsJson = await itemsRes.json();
        const categoriesJson = await categoriesRes.json();
        if (cancelled) return;
        setItems(itemsJson.data?.items ?? []);
        setCategories(categoriesJson.data?.categories ?? []);
        if (recentRes.ok) {
          const recentJson = await recentRes.json();
          const recent = recentJson.data ?? recentJson;
          setRecentOrders(recent.orders ?? []);
          setSettings({
            businessName: recent.settings?.businessName ?? "",
            currency: recent.settings?.currency ?? "PKR",
            pickupAvailable: recent.settings?.pickupAvailable !== false,
            paymentMethods: recent.settings?.paymentMethods ?? "Cash on delivery",
            canCollectPayment: Boolean(recent.canCollectPayment),
          });
        }
      } catch {
        if (!cancelled) setError("The menu could not be loaded. Please retry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  /* --------- Silent menu refresh when the tab regains focus --------- */
  useEffect(() => {
    if (!tenantId) return;
    const refetch = () => {
      authFetch(`/api/menu/items?tenantId=${tenantId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json?.data?.items) setItems(json.data.items);
          return undefined;
        })
        .catch(() => undefined);
      authFetch(`/api/menu/categories?tenantId=${tenantId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json?.data?.categories) setCategories(json.data.categories);
          return undefined;
        })
        .catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("focus", refetch);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refetch);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tenantId]);

  /** Refreshes recent orders and settings after an order was placed. */
  const refreshRecent = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await authFetch(`/api/pos/orders?tenantId=${tenantId}`);
      if (!res.ok) return;
      const json = await res.json();
      const recent = json.data ?? json;
      setRecentOrders(recent.orders ?? []);
      if (recent.settings) {
        setSettings((current) =>
          current
            ? {
                ...current,
                businessName: recent.settings.businessName ?? current.businessName,
                currency: recent.settings.currency ?? current.currency,
                pickupAvailable: recent.settings.pickupAvailable !== false,
                paymentMethods: recent.settings.paymentMethods ?? current.paymentMethods,
                canCollectPayment: Boolean(recent.canCollectPayment),
              }
            : null
        );
      }
    } catch {
      // Recents stay stale; not worth blocking the flow.
    }
  }, [tenantId]);

  /* ---------------- Quote: authoritative totals on every change ---------------- */
  const requestQuote = useCallback(async () => {
    if (!tenantId || lines.length === 0) {
      setQuote({ ...EMPTY_QUOTE });
      return;
    }
    quoteAbort.current?.abort();
    const controller = new AbortController();
    quoteAbort.current = controller;
    setQuote((current) => ({ ...current, loading: true, blockedReason: null }));
    try {
      const response = await authFetch("/api/pos/quote", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          tenantId,
          fulfilmentType,
          address:
            fulfilmentType === "delivery" && customer.address ? customer.address : undefined,
          items: lines.map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            selections: line.selections,
          })),
        }),
      });
      if (!response.ok) {
        throw new Error("quote failed");
      }
      const json = await response.json();
      const data = json.data ?? json;
      setQuote({
        loading: false,
        subtotalMinor: data.subtotalMinor ?? 0,
        discountMinor: data.discountMinor ?? 0,
        deliveryFeeMinor: data.deliveryFeeMinor ?? 0,
        totalMinor: data.totalMinor ?? 0,
        appliedOfferName: data.appliedOfferName ?? null,
        minimumOrderMinor: data.minimumOrderMinor ?? null,
        blockedReason: data.blockedReason ?? null,
      });
    } catch (caught) {
      if ((caught as Error).name === "AbortError") return;
      setQuote({
        ...EMPTY_QUOTE,
        loading: false,
        blockedReason: "The total could not be checked. Please retry.",
      });
    }
  }, [tenantId, lines, fulfilmentType, customer.address]);

  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(requestQuote, 350);
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
  }, [requestQuote]);

  /* ---------------- Line management (client only, no totals) ---------------- */
  const addItemToOrder = useCallback(
    (item: PosMenuItem, selections: ItemSelection[] = []) => {
      const groups = optionGroupsOf({ optionGroups: item.optionGroups });
      setLines((current) => [
        ...current,
        {
          lineId: nextLineId(),
          itemId: item.itemId,
          name: item.name,
          quantity: 1,
          selections,
          note: "",
          basePriceMinor: item.basePriceMinor,
          optionGroups: groups,
        },
      ]);
    },
    []
  );

  const onPick = useCallback(
    (item: PosMenuItem) => {
      if (activeOptionGroups(item).length > 0) {
        setLineForSheet(null);
        setItemForSheet(item);
        return;
      }
      addItemToOrder(item);
    },
    [addItemToOrder]
  );

  const setQuantity = useCallback((lineId: string, quantity: number) => {
    setLines((current) =>
      current.map((line) =>
        line.lineId === lineId ? { ...line, quantity: Math.max(1, Math.min(20, quantity)) } : line
      )
    );
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setLines((current) => current.filter((line) => line.lineId !== lineId));
  }, []);

  const setNote = useCallback((lineId: string, note: string) => {
    setLines((current) =>
      current.map((line) => (line.lineId === lineId ? { ...line, note } : line))
    );
  }, []);

  const openConfigure = useCallback(
    (lineId: string) => {
      const line = lines.find((entry) => entry.lineId === lineId);
      if (!line) return;
      const item = items.find((entry) => entry.itemId === line.itemId);
      if (!item) return;
      setLineForSheet(lineId);
      setItemForSheet(item);
    },
    [lines, items]
  );

  const resetOrder = useCallback(() => {
    setLines([]);
    setCustomer(DEFAULT_CUSTOMER);
    setFulfilmentType("pickup");
    setQuote({ ...EMPTY_QUOTE });
    setPendingIntent(null);
  }, []);

  /* ---------------- Actions: KOT / bill / draft ---------------- */
  const validateCustomer = useCallback((details: CustomerDetails): string | null => {
    if (details.customerName.trim().length < 2) return "Enter the customer name.";
    if (details.customerPhone.trim().length < 10) return "Enter a valid phone number.";
    if (details.fulfilmentType === "delivery" && details.address.trim().length < 8) {
      return "Add the delivery address.";
    }
    return null;
  }, []);

  const submitOrder = useCallback(
    async (
      intent: Exclude<PendingIntent, null>,
      details: CustomerDetails,
      paymentMethod?: string
    ): Promise<boolean> => {
      if (!tenantId || lines.length === 0) return false;
      setSubmitting(true);
      setSubmitError(null);
      // Idempotency key per submission: a retry (e.g. a dropped request)
      // cannot create the order twice.
      const idempotencyKey = `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        const response = await authFetch("/api/pos/orders", {
          method: "POST",
          body: JSON.stringify({
            tenantId,
            action: intent === "kot" ? "kot" : "bill",
            items: lines.map((line) => ({
              itemId: line.itemId,
              quantity: line.quantity,
              selections: line.selections,
              note: line.note || undefined,
            })),
            customerName: details.customerName,
            customerPhone: details.customerPhone,
            fulfilmentType: details.fulfilmentType,
            address: details.fulfilmentType === "delivery" ? details.address : undefined,
            notes: details.notes || undefined,
            paymentMethod,
            idempotencyKey,
          }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          setSubmitError(
            extractApiErrorMessage(json, "The order could not be saved.")
          );
          return false;
        }
        const data = json.data ?? json;

        let suffix = "";
        if (data.paymentError) {
          suffix = " A manager has to confirm the payment in the Orders tab.";
        } else if (intent === "kot") {
          suffix = "";
        } else if (!data.paymentRecorded) {
          suffix = "";
        }
        // Printing happens only after the backend confirms creation.
        const printable = {
          orderNumber: String(data.orderNumber ?? ""),
          businessName: settings?.businessName || undefined,
          createdAt: data.createdAt,
          fulfilmentType: details.fulfilmentType,
          address: details.fulfilmentType === "delivery" ? details.address : "",
          customerName: details.customerName,
          customerPhone: details.customerPhone,
          notes: details.notes || undefined,
          items: (data.items ?? []).map(
            (item: {
              name?: string;
              quantity?: number;
              unitPriceMinor?: number;
              basePriceMinor?: number;
              lineTotalMinor?: number;
              options?: unknown;
              note?: string;
            }) => ({
              name: String(item.name ?? ""),
              quantity: Number(item.quantity ?? 0),
              unitPriceMinor: Number(item.unitPriceMinor ?? 0),
              basePriceMinor:
                item.basePriceMinor === undefined ? undefined : Number(item.basePriceMinor),
              lineTotalMinor: Number(item.lineTotalMinor ?? 0),
              options: Array.isArray(item.options) ? item.options : [],
              note: item.note,
            })
          ),
          subtotalMinor: Number(data.pricing?.subtotalMinor ?? 0),
          discountMinor: Number(data.pricing?.discountMinor ?? 0),
          deliveryFeeMinor: Number(data.pricing?.deliveryFeeMinor ?? 0),
          totalMinor: Number(data.pricing?.totalMinor ?? 0),
          currency: currency,
          appliedOffer: data.appliedOffer ?? null,
          paymentStatus: String(data.paymentStatus ?? "unpaid"),
          paymentMethod: data.paymentMethod ?? null,
        };

        if (intent === "kot") {
          setNotice(`Order ${printable.orderNumber} sent to the kitchen.`);
          if (!printKot(printable)) {
            setNotice((current) => `${current} Allow pop-ups to print.`);
          }
        } else if (intent === "billPrint") {
          setNotice(`Bill for ${printable.orderNumber} saved.`);
          if (!printBill(printable)) {
            setNotice((current) => `${current} Allow pop-ups to print.`);
          }
        } else if (data.paymentRecorded) {
          setNotice(`Payment received for ${printable.orderNumber}.`);
        } else {
          setNotice(`Order ${printable.orderNumber} recorded${suffix}.`);
        }

        resetOrder();
        refreshRecent();
        return true;
      } catch {
        setSubmitError("The order could not be saved. Check the connection and retry.");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [tenantId, lines, settings, currency, resetOrder, refreshRecent]
  );

  const startAction = useCallback(
    (kind:Exclude<PendingIntent, null>) => {
      if (lines.length === 0) return;
      setSubmitError(null);
      setPendingIntent(kind);
      setCustomerSheetOpen(true);
    },
    [lines.length]
  );

  const onCustomerConfirm = useCallback(
    async (details: CustomerDetails) => {
      const validationError = validateCustomer(details);
      setSubmitError(validationError);
      if (validationError || !pendingIntent) return;
      setCustomer(details);
      if (pendingIntent === "billPay") {
        setCustomerSheetOpen(false);
        setPaymentSheetOpen(true);
        return;
      }
      const intent: "kot" | "billPrint" = pendingIntent;
      setBusy(intent === "kot" ? "kot" : "billPrint");
      const ok = await submitOrder(intent, details);
      setBusy(null);
      if (ok) {
        setCustomerSheetOpen(false);
        setPendingIntent(null);
      } else {
        setCustomerSheetOpen(true);
      }
    },
    [pendingIntent, validateCustomer, submitOrder]
  );

  const onPaymentConfirm = useCallback(
    async (method: string) => {
      if (!pendingIntent) return;
      const ok = await submitOrder(pendingIntent, customer, method);
      if (ok) {
        setPaymentSheetOpen(false);
        setPendingIntent(null);
      }
    },
    [pendingIntent, customer, submitOrder]
  );

  /* ---------------- Drafts ---------------- */
  const loadDrafts = useCallback(async () => {
    if (!tenantId) return;
    setDraftsLoading(true);
    try {
      const res = await authFetch(`/api/pos/drafts?tenantId=${tenantId}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      const data = json.data ?? json;
      setDrafts(data.drafts ?? []);
    } catch {
      setError("The drafts could not be loaded. Please retry.");
    } finally {
      setDraftsLoading(false);
    }
  }, [tenantId]);

  const saveDraft = useCallback(async () => {
    if (!tenantId || lines.length === 0) return;
    setBusy("bill");
    try {
      const res = await authFetch("/api/pos/drafts", {
        method: "POST",
        body: JSON.stringify({
          tenantId,
          draftId: `posdraft${Date.now().toString(36)}${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          items: lines.map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            selections: line.selections,
            note: line.note || undefined,
          })),
          customerName: customer.customerName || undefined,
          customerPhone: customer.customerPhone || undefined,
          fulfilmentType,
          address: customer.address || undefined,
          notes: customer.notes || undefined,
          currency: "PKR",
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(
          extractApiErrorMessage(json, "The draft could not be saved.")
        );
      } else {
        setNotice(
          `Draft saved with ${lines.length} items. Continue later from the draft list.`
        );
        resetOrder();
      }
    } catch {
      setError("The draft could not be saved. Please retry.");
    } finally {
      setBusy(null);
    }
  }, [tenantId, lines, customer, fulfilmentType, resetOrder]);

  const loadDraft = useCallback(
    (draft: PosDraftSummary) => {
      setDraftSheetOpen(false);
      setLines(
        draft.items.map((item) => {
          const menuItem = items.find((entry) => entry.itemId === item.itemId);
          return {
            lineId: nextLineId(),
            itemId: item.itemId,
            name: item.name ?? menuItem?.name ?? item.itemId,
            quantity: Math.max(1, Math.min(20, Number(item.quantity ?? 1))),
            selections:
              item.selections ??
              [], // Carts store resolved options; selections recovered below.
            note: item.note ?? "",
            basePriceMinor: menuItem?.basePriceMinor ?? 0,
            optionGroups: menuItem ? optionGroupsOf({ optionGroups: menuItem.optionGroups }) : [],
            resolved: Array.isArray(item.options) ? item.options : [],
          };
        })
      );
      setCustomer({
        ...DEFAULT_CUSTOMER,
        customerName: draft.customer?.name ?? "",
        customerPhone: draft.customer?.phone ?? "",
        address: draft.fulfilment?.address ?? "",
        notes: draft.notes ?? "",
      });
      const type = draft.fulfilment?.type === "delivery" ? "delivery" : "pickup";
      setFulfilmentType(type);
      setNotice(`Draft loaded with ${draft.items.length} items.`);
    },
    [items]
  );

  const deleteDraft = useCallback(
    async (draftId: string) => {
      if (!tenantId) return;
      try {
        await authFetch(
          `/api/pos/drafts?tenantId=${tenantId}&draftId=${encodeURIComponent(draftId)}`,
          { method: "DELETE" }
        );
      } catch {
        setError("The draft could not be deleted. Please retry.");
        return;
      }
      setDrafts((current) => current.filter((entry) => entry.draftId !== draftId));
    },
    [tenantId]
  );

  /* ---------------- derived ---------------- */
  const soldOutCount = useMemo(
    () =>
      items.filter(
        (item) => item.availability === "soldOut" && item.publicationStatus === "published"
      ).length,
    [items]
  );

  const paymentMethods = useMemo(
    () =>
      (settings?.paymentMethods ?? "Cash on delivery")
        .split(",")
        .map((method) => method.trim())
        .filter(Boolean)
        .slice(0, 5),
    [settings]
  );

  const fulfilments = useMemo(
    () =>
      settings?.pickupAvailable === false
        ? [{ value: "delivery" as const, label: "Delivery" }]
        : [
            { value: "pickup" as const, label: "Counter / Pickup" },
            { value: "delivery" as const, label: "Delivery" },
          ],
    [settings]
  );

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  /* ---------------- render ---------------- */
  if (!tenantId) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error ?? "No restaurant is linked to your account."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Point of sale (POS)</h1>
          <p className="text-sm text-muted-foreground">
            {settings?.businessName
              ? `${settings.businessName} · counter orders`
              : "Counter orders"}{" "}
            <Link href="/dashboard/orders" className="underline">
              All orders
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role && user.role !== "owner" && (
            <Badge variant="outline">{user.role}</Badge>
          )}
          <Button size="sm" onClick={resetOrder} className="bg-orange-600 hover:bg-orange-700">
            + New
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDraftSheetOpen(true);
              loadDrafts();
            }}
          >
            Draft list
          </Button>
        </div>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => setError(null)}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {notice && !error && (
        <Alert>
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>{notice}</span>
            <Button size="sm" variant="ghost" onClick={() => setNotice(null)}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:h-[calc(100vh-10.5rem)] lg:grid-cols-[1fr_360px] lg:overflow-hidden">
        <ProductGrid
          items={items}
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={setSelectedCategoryId}
          query={query}
          onQueryChange={setQuery}
          currency={currency}
          loading={loading}
          soldOutCount={soldOutCount}
          onPick={onPick}
        />

        <section className="rounded-lg border bg-muted/40 p-3 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden">
          <OrderPanel
            fulfilments={fulfilments}
            fulfilmentType={fulfilmentType}
            onFulfilmentTypeChange={setFulfilmentType}
            currency={currency}
            lines={lines}
            quote={quote}
            recentOrders={recentOrders}
            busy={busy}
            paymentEnabled={settings?.canCollectPayment ?? false}
            onSetQuantity={setQuantity}
            onRemoveLine={removeLine}
            onConfigure={openConfigure}
            onSetNote={setNote}
            onKot={() => startAction("kot")}
            onDraft={saveDraft}
            onBill={() => startAction("billPay")}
            onBillPrint={() => startAction("billPrint")}
          />
        </section>
      </div>

      <ItemOptionsSheet
        item={itemForSheet}
        initialSelections={
          lineForSheet
            ? lines.find((line) => line.lineId === lineForSheet)?.selections
            : undefined
        }
        initialQuantity={1}
        currency={currency}
        onConfirm={(selections, quantity) => {
          setItemForSheet(null);
          if (lineForSheet) {
            setLines((current) =>
              current.map((line) =>
                line.lineId === lineForSheet
                  ? {
                      ...line,
                      selections,
                      quantity,
                      resolved: displayResolved(line.optionGroups, selections),
                    }
                  : line
              )
            );
            setLineForSheet(null);
            return;
          }
          const item = itemForSheet;
          if (!item) return;
          addItemToOrder(item, selections);
          for (let index = 1; index < quantity; index += 1) {
            addItemToOrder(item, selections);
          }
        }}
        onClose={() => {
          setItemForSheet(null);
          setLineForSheet(null);
        }}
      />

      <CustomerSheet
        open={customerSheetOpen}
        details={{ ...customer, fulfilmentType }}
        paymentMode={pendingIntent === "billPay"}
        submitLabel={
          pendingIntent === "billPay"
            ? "Choose payment method"
            : pendingIntent === "kot"
              ? "Send to kitchen"
              : "Save bill"
        }
        error={submitError}
        onConfirm={onCustomerConfirm}
        onClose={() => {
          setCustomerSheetOpen(false);
          setPendingIntent(null);
        }}
      />

      <PaymentSheet
        open={paymentSheetOpen}
        methods={paymentMethods}
        totalLabel={quote.totalMinor > 0 ? formatMoney(quote.totalMinor, currency) : "the total"}
        error={submitError}
        submitting={submitting}
        onConfirm={onPaymentConfirm}
        onClose={() => {
          setPaymentSheetOpen(false);
          setPendingIntent(null);
        }}
      />

      <DraftListSheet
        open={draftSheetOpen}
        drafts={drafts}
        loading={draftsLoading}
        onLoad={loadDraft}
        onDelete={deleteDraft}
        onClose={() => setDraftSheetOpen(false)}
      />
    </div>
  );
}
