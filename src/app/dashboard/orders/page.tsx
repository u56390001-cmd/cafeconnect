"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, Download, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { NoTenantNotice } from "@/components/dashboard/NoTenantNotice";
import { printBill } from "@/lib/print/receipt";
import {
  OrderTableRow,
  money,
  paymentLabel,
  whenAt,
} from "@/components/orders/orders-table";
import { STATUS_LABELS, type CartView, type Order } from "@/components/orders/types";
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

/** Tabs grouped after the reference layout: every pipeline stage stays one click away. */
const TABS: Array<{ id: string; label: string; statuses?: string[] }> = [
  { id: "all", label: "All Menu" },
  { id: "pending", label: "Pending", statuses: ["received"] },
  { id: "preparing", label: "Preparing", statuses: ["confirmed", "preparing"] },
  { id: "ready", label: "Ready", statuses: ["ready"] },
  { id: "dispatched", label: "Dispatched", statuses: ["dispatched"] },
  { id: "completed", label: "Completed", statuses: ["completed"] },
  { id: "cancelled", label: "Cancelled", statuses: ["declined", "cancelled"] },
];

const ROS_STATUSES = ["received"];
const PREPARING_STATUSES = ["confirmed", "preparing", "ready"];
const READY_STATUSES = ["ready"];
const COMPLETED_STATUSES = ["completed"];

const PAGE_SIZES = [8, 16, 24, 32];

function pageList(total: number, current: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "…", total];
  }
  if (current >= total - 3) {
    return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "…", current - 1, current, current + 1, "…", total];
}

/** Last 7 days vs the 7 days before, per status group; null when no baseline exists. */
function periodDelta(list: Order[], statuses?: string[]): number | null {
  const now = Date.now();
  const week = 7 * 86_400_000;
  const inGroup = (order: Order) =>
    statuses ? statuses.includes(order.status) : true;
  const parse = (order: Order) => Date.parse(order.createdAt);
  const countBetween = (from: number, to: number) =>
    list.filter((order) => {
      const t = parse(order);
      return inGroup(order) && !Number.isNaN(t) && t >= from && t < to;
    }).length;
  const last = countBetween(now - week, now);
  const prior = countBetween(now - 2 * week, now - week);
  if (prior === 0) return null;
  return Math.round(((last - prior) / prior) * 100);
}

function DeltaLine({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <p className="mt-1 text-xs text-muted-foreground">vs last period</p>;
  }
  const up = delta >= 0;
  return (
    <p
      className={cn(
        "mt-1 text-xs font-medium",
        delta === 0 ? "text-muted-foreground" : up ? "text-success" : "text-destructive"
      )}
    >
      {up ? "+" : ""}
      {delta}% vs last period
    </p>
  );
}

function exportCsv(list: Order[]) {
  const header = ["Order ID", "Customer", "Items", "Amount", "Status", "Date & Time", "Payment Status"];
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = list.map((order) =>
    [
      order.orderNumber,
      order.customer?.name || "Guest",
      (order.items ?? []).map((item) => `${item.quantity}x ${item.name}`).join("; "),
      money(order.totalMinor, order.currency),
      STATUS_LABELS[order.status] ?? order.status,
      whenAt(order.createdAt),
      paymentLabel(order.paymentStatus),
    ]
      .map(escape)
      .join(",")
  );
  const csv = [header.map(escape).join(","), ...rows].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function OrdersPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [orders, setOrders] = useState<Order[]>([]);
  const [carts, setCarts] = useState<CartView[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(8);
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState("");
  const [loadError, setLoadError] = useState("");
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

  const countByGroup = useCallback(
    (statuses?: string[]) => {
      if (!statuses) return orders.length;
      return orders.filter((order) => statuses.includes(order.status)).length;
    },
    [orders]
  );

  const filtered = useMemo(() => {
    if (!tenantId) return [];
    const tabDef = TABS.find((item) => item.id === tab) ?? TABS[0];
    const needle = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (tabDef.statuses && !tabDef.statuses.includes(order.status)) return false;
      if (paymentFilter === "paid" && order.paymentStatus !== "paid") return false;
      if (paymentFilter === "unpaid" && order.paymentStatus === "paid") return false;
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
  }, [orders, tab, search, paymentFilter, tenantId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  // Keep the page anchored and clear stale selections when the view changes.
  useEffect(() => {
    setPage(safePage);
  }, [safePage]);
  useEffect(() => {
    setSelected(new Set());
  }, [tab, search, paymentFilter]);

  const allPageSelected =
    pageItems.length > 0 && pageItems.every((order) => selected.has(order.orderId));

  const toggleRow = (orderId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageItems.forEach((order) => next.delete(order.orderId));
      } else {
        pageItems.forEach((order) => next.add(order.orderId));
      }
      return next;
    });
  };

  const exportTarget =
    selected.size > 0 ? orders.filter((order) => selected.has(order.orderId)) : filtered;

  const activeCarts = carts.filter((cart) => cart.items.length > 0);

  const kpis = [
    { label: "Total Orders", value: countByGroup(), statuses: undefined as string[] | undefined },
    { label: "Pending Orders", value: countByGroup(ROS_STATUSES), statuses: ROS_STATUSES },
    { label: "Preparing Orders", value: countByGroup(PREPARING_STATUSES), statuses: PREPARING_STATUSES },
    { label: "Saved Carts", value: activeCarts.length, statuses: null },
    { label: "Completed Orders", value: countByGroup(COMPLETED_STATUSES), statuses: COMPLETED_STATUSES },
  ];

  if (!tenantId) return <NoTenantNotice />;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      {/* Card header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground">Orders</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manage all orders of the Restaurant
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {newOrderCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setTab("pending");
                setNewOrderCount(0);
              }}
              className="h-9 rounded-md border-warning/30 bg-warning/10 text-warning hover:bg-warning/20 hover:text-warning"
            >
              {newOrderCount} new
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground hover:text-foreground"
            onClick={() => void load()}
            aria-label="Refresh orders"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            className="h-9 border-border text-sm font-medium text-foreground"
            onClick={() => exportCsv(exportTarget)}
          >
            <Download data-icon="inline-start" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI band: five metrics split by hairline dividers */}
      <div className="grid grid-cols-1 gap-px border-y border-border bg-border sm:grid-cols-3 xl:grid-cols-5">
        {loading
          ? Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="bg-card px-5 py-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-2 h-8 w-16" />
                <Skeleton className="mt-2 h-3 w-24" />
              </div>
            ))
          : kpis.map((kpi) => (
              <div key={kpi.label} className="bg-card px-5 py-4">
                <p className="text-sm font-medium text-foreground">{kpi.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {kpi.value}
                </p>
                {kpi.statuses === null ? (
                  <p className="mt-1 text-xs text-muted-foreground">open right now</p>
                ) : (
                  <DeltaLine delta={periodDelta(orders, kpi.statuses)} />
                )}
              </div>
            ))}
      </div>

      {/* Tabs + tools */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
        {!loading ? (
          <nav aria-label="Filter orders by stage" className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 min-w-0">
            {TABS.map((tabDef) => {
              const active = tab === tabDef.id;
              return (
                <button
                  key={tabDef.id}
                  type="button"
                  onClick={() => {
                    setTab(tabDef.id);
                    setPage(1);
                  }}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary font-medium text-primary-foreground"
                      : "bg-secondary/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {tabDef.label}
                </button>
              );
            })}
          </nav>
        ) : (
          <Skeleton className="h-10 w-72" />
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search"
              aria-label="Search orders"
              className="h-10 w-44 rounded-full border-border bg-secondary/50 pl-9 sm:w-56"
            />
          </div>
          <Select
            value={paymentFilter}
            onValueChange={(value) => {
              setPaymentFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 w-36 rounded-full border-border bg-secondary/50 pl-3 text-muted-foreground">
              <SlidersHorizontal className="mr-1 size-4 shrink-0" aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payments</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unpaid">On hold</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {actionError ? (
        <div className="px-5 pt-4">
          <Alert variant="destructive">
            <AlertTitle>Could not update the order</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      {loadError ? (
        <div className="px-5 pt-4">
          <Alert variant="destructive">
            <AlertTitle>Could not load orders</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {/* Table */}
      <Table aria-label="Orders">
        <TableHeader>
          <TableRow className="bg-primary/[0.06] hover:bg-primary/[0.06] border-b border-border">
            <TableHead className="w-12 pl-5 pr-2">
              <Checkbox
                checked={allPageSelected}
                onCheckedChange={togglePage}
                aria-label="Select all orders on this page"
              />
            </TableHead>
            <TableHead className="px-2 text-xs font-medium text-foreground/80">Order ID</TableHead>
            <TableHead className="px-2 text-xs font-medium text-foreground/80">Items Name</TableHead>
            <TableHead className="px-2 text-xs font-medium text-foreground/80">Amount</TableHead>
            <TableHead className="px-2 text-xs font-medium text-foreground/80">Status</TableHead>
            <TableHead className="px-2 text-xs font-medium text-foreground/80">Date &amp; Time</TableHead>
            <TableHead className="px-2 text-xs font-medium text-foreground/80">Payment Status</TableHead>
            <TableHead className="pr-5 text-right text-xs font-medium text-foreground/80">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell className="pl-5 pr-2">
                  <Skeleton className="size-4" />
                </TableCell>
                <TableCell className="px-2">
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell className="px-2">
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell className="px-2">
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell className="px-2">
                  <Skeleton className="h-6 w-20 rounded-full" />
                </TableCell>
                <TableCell className="px-2">
                  <Skeleton className="h-4 w-32" />
                </TableCell>
                <TableCell className="px-2">
                  <Skeleton className="h-6 w-16 rounded-full" />
                </TableCell>
                <TableCell className="pr-5">
                  <Skeleton className="ml-auto size-8" />
                </TableCell>
              </TableRow>
            ))
          ) : pageItems.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8}>
                <Empty className="rounded-lg py-14">
                  <EmptyMedia>
                    <ClipboardList className="size-5" aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>No orders here</EmptyTitle>
                    <EmptyDescription>
                      {tab === "all"
                        ? "Share your store link so customers can order."
                        : `No orders match the ${TABS.find((item) => item.id === tab)?.label ?? tab} stage. Try another tab or clear the search.`}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </TableCell>
            </TableRow>
          ) : (
            pageItems.map((order) => (
              <OrderTableRow
                key={order.orderId}
                order={order}
                selected={selected.has(order.orderId)}
                onToggle={toggleRow}
                onPatch={patchOrder}
                onPrint={printTicket}
              />
            ))
          )}
        </TableBody>
      </Table>

      {/* Footer: page position, numbered pages, rows per page */}
      <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-5 py-4 sm:flex-row">
        {loading ? (
          <Skeleton className="h-4 w-32" />
        ) : (
          <p className="text-xs text-muted-foreground">
            Page {safePage} of {totalPages}
            {selected.size > 0 ? (
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                {selected.size} selected
              </span>
            ) : null}
          </p>
        )}
        {!loading && totalPages > 1 ? (
          <nav aria-label="Pagination" className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPage(safePage - 1)}
              disabled={safePage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            {pageList(totalPages, safePage).map((item, index) =>
              item === "…" ? (
                <span
                  key={`gap-${index}`}
                  className="flex size-8 items-center justify-center text-xs text-muted-foreground"
                  aria-hidden="true"
                >
                  …
                </span>
              ) : (
                <Button
                  key={item}
                  variant={item === safePage ? "default" : "outline"}
                  size="icon"
                  className={cn(
                    "size-8 tabular-nums",
                    item === safePage
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setPage(item)}
                  aria-label={`Page ${item}`}
                  aria-current={item === safePage ? "page" : undefined}
                >
                  {item}
                </Button>
              )
            )}
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </nav>
        ) : null}
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-40 rounded-md border-border text-xs text-muted-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} data per row
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return <OrdersPage />;
}
