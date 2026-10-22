"use client";

import { useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/domain/money";
import {
  activeOptionGroups,
  type PosCategory,
  type PosMenuItem,
} from "@/lib/pos/types";

const CATEGORY_COLORS = [
  "bg-orange-100 text-orange-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-emerald-100 text-emerald-800",
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
];

interface ProductGridProps {
  items: PosMenuItem[];
  categories: PosCategory[];
  selectedCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  currency: string;
  loading: boolean;
  soldOutCount: number;
  onPick: (item: PosMenuItem) => void;
}

/**
 * Product picker of the counter. Nothing in this grid can change an order:
 * picking a product only opens the configurator or adds a simple product to
 * the order panel, and the server still prices everything.
 */
export function ProductGrid({
  items,
  categories,
  selectedCategoryId,
  onSelectCategory,
  query,
  onQueryChange,
  currency,
  loading,
  soldOutCount,
  onPick,
}: ProductGridProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  const activeCategories = useMemo(
    () =>
      categories
        .filter((category) => (category.status ?? "active") !== "hidden")
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [categories]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter(
        (item) =>
          (selectedCategoryId === "all" || item.categoryId === selectedCategoryId) &&
          item.publicationStatus === "published" &&
          // Paused items are never orderable; sold-out stay visible for
          // awareness but cannot be added.
          item.availability !== "paused" &&
          (q === "" ||
            item.name.toLowerCase().includes(q) ||
            (item.description ?? "").toLowerCase().includes(q))
      )
      .sort((a, b) => {
        const availability =
          Number(a.availability === "available") - Number(b.availability === "available");
        return availability !== 0 ? availability : a.name.localeCompare(b.name);
      });
  }, [items, selectedCategoryId, query]);

  const categoryLabel = (categoryId: string): string =>
    categories.find((c) => c.categoryId === categoryId)?.name ?? "Menu";

  const colorFor = (categoryId: string): string => {
    const index = activeCategories.findIndex((c) => c.categoryId === categoryId);
    return index >= 0 ? CATEGORY_COLORS[index % CATEGORY_COLORS.length] : CATEGORY_COLORS[0];
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3" aria-label="Products">
      <div className="relative">
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search products…"
          aria-label="Search products"
          className="h-10"
        />
        {query !== "" && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onSelectCategory("all")}
          aria-pressed={selectedCategoryId === "all"}
          className={cn(
            "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
            selectedCategoryId === "all"
              ? "border-transparent bg-orange-600 text-white"
              : "bg-white text-foreground hover:bg-muted"
          )}
        >
          Show All
        </button>
        {activeCategories.map((category) => (
          <button
            key={category.categoryId}
            type="button"
            onClick={() => onSelectCategory(category.categoryId)}
            aria-pressed={selectedCategoryId === category.categoryId}
            className={cn(
              "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
              selectedCategoryId === category.categoryId
                ? "border-transparent bg-orange-600 text-white"
                : "bg-white text-foreground hover:bg-muted"
            )}
          >
            {category.name}
          </button>
        ))}
        {soldOutCount > 0 && (
          <Badge variant="outline" className="ml-auto text-muted-foreground">
            {soldOutCount} sold out
          </Badge>
        )}
      </div>

      <div className="min-h-0 flex-1 -mr-2 pr-2 overflow-y-auto">
        <div className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3 xl:grid-cols-4">
          {loading &&
            Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="rounded-lg border bg-white p-3">
                <Skeleton className="mb-2 h-24 w-full" />
                <Skeleton className="mb-1 h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}

          {!loading && filtered.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
              {items.length === 0
                ? "No published menu items yet. Add products in the Menu tab first."
                : "No products match the search."}
            </div>
          )}

          {!loading &&
            filtered.map((item) => {
              const soldOut = item.availability === "soldOut";
              const needsConfiguration = activeOptionGroups(item).length > 0;
              return (
                <button
                  key={item.itemId}
                  type="button"
                  disabled={soldOut}
                  onClick={() => onPick(item)}
                  className={cn(
                    "group flex h-full flex-col rounded-lg border bg-white p-3 text-left transition-all",
                    soldOut
                      ? "cursor-not-allowed opacity-60"
                      : "hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:outline-none"
                  )}
                  aria-disabled={soldOut}
                >
                  <div className="mb-2 aspect-square w-full overflow-hidden rounded-md bg-muted">
                    {item.imageReferences?.[0] ? (
                      // Menu images are served by the tenant-configured
                      // public URLs; onError falls back to the initial tile.
                      <ProductImage imageUrl={item.imageReferences[0]} name={item.name} />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-orange-50 text-2xl font-semibold text-orange-300">
                        {item.name.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <span className="line-clamp-2 text-sm font-medium">{item.name}</span>
                  <div className="mt-1 flex items-center justify-between">
                    <span
                      className={cn(
                        "text-xs",
                        soldOut ? "text-red-600" : "text-orange-600"
                      )}
                    >
                      {soldOut ? "Sold out" : formatMoney(item.basePriceMinor, currency)}
                    </span>
                    <Badge variant="outline" className={cn("border-transparent px-1.5 text-[10px]", colorFor(item.categoryId))}>
                      {categoryLabel(item.categoryId)}
                    </Badge>
                  </div>
                  {needsConfiguration && !soldOut && (
                    <span className="mt-1 text-[11px] text-muted-foreground">
                      Tap to choose options
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
    </section>
  );
}

function ProductImage({ imageUrl, name }: { imageUrl: string; name: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={name}
      loading="lazy"
      className="h-full w-full object-cover"
      onError={(event) => {
        (event.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

export function GridFooterActions({
  onNewOrder,
  onDrafts,
}: {
  onNewOrder: () => void;
  onDrafts: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={onNewOrder} className="bg-orange-600 hover:bg-orange-700">
        + New
      </Button>
      <Button size="sm" variant="outline" onClick={onDrafts}>
        Draft list
      </Button>
    </div>
  );
}
