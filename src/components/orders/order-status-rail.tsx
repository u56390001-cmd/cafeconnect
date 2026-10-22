"use client";

import {
  BellRing,
  Bike,
  Check,
  CheckCircle2,
  ChefHat,
  Inbox,
  LayoutGrid,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const STATUS_ORDER = [
  "all",
  "received",
  "confirmed",
  "preparing",
  "ready",
  "dispatched",
  "completed",
  "cancelled",
] as const;

export type StatusFilter = (typeof STATUS_ORDER)[number];

/** Dots + stripes follow the tokens already in the design system. */
export const STATUS_DOT: Record<string, string> = {
  all: "bg-muted-foreground",
  received: "bg-warning",
  confirmed: "bg-primary",
  preparing: "bg-primary",
  ready: "bg-primary",
  dispatched: "bg-primary",
  completed: "bg-success",
  declined: "bg-destructive",
  cancelled: "bg-destructive",
};

const STAGE_ICON: Record<string, LucideIcon> = {
  all: LayoutGrid,
  received: Inbox,
  confirmed: Check,
  preparing: ChefHat,
  ready: BellRing,
  dispatched: Bike,
  completed: CheckCircle2,
  cancelled: XCircle,
};

const STATUS_LABELS: Record<string, string> = {
  all: "All orders",
  received: "Received",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  dispatched: "Dispatched",
  completed: "Completed",
  cancelled: "Cancelled",
};

export interface OrderStatusRailProps {
  counts: Record<string, number>;
  active: StatusFilter;
  onChange: (status: StatusFilter) => void;
}

/**
 * Vertical stage navigation for the Orders page. On small screens it
 * becomes a horizontal chip strip so the list always starts above the fold.
 */
export function OrderStatusRail({ counts, active, onChange }: OrderStatusRailProps) {
  return (
    <nav
      aria-label="Filter orders by status"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {STATUS_ORDER.map((status) => {
        const Icon = STAGE_ICON[status] ?? LayoutGrid;
        const count = status === "all" ? (counts.all ?? 0) : (counts[status] ?? 0);
        const isActive = active === status;
        return (
          <button
            key={status}
            type="button"
            onClick={() => onChange(status)}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors lg:w-full",
              isActive
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon
              className={cn("size-4 shrink-0", isActive ? "text-primary" : STATUS_DOT[status])}
              aria-hidden="true"
            />
            <span className="whitespace-nowrap">{STATUS_LABELS[status] ?? status}</span>
            <span
              className={cn(
                "ml-auto hidden min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] tabular-nums lg:block",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : count > 0
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground/60"
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
