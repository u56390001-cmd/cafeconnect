"use client";

import { useState } from "react";
import { Archive, Copy, Eye, EyeOff, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyContent } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/domain/money";
import type { ImageReference } from "@/lib/media/images";
import { cn } from "@/lib/utils";

export interface MenuItemView {
  itemId: string;
  categoryId: string;
  name: string;
  description: string;
  basePriceMinor: number;
  availability: string;
  publicationStatus: string;
  status: string;
  sortOrder: number;
  aliases: string[];
  imageReferences: ImageReference[];
  spiceLevel?: string;
  portion?: string;
  dietaryLabels?: string[];
}

const AVAILABILITY_LABEL: Record<string, string> = {
  available: "Available",
  soldOut: "Sold out",
  paused: "Paused",
};

interface ProductListProps {
  loading: boolean;
  items: MenuItemView[];
  categories: Array<{ categoryId: string; name: string }>;
  selected: string[];
  filtersActive: boolean;
  hasProducts: boolean;
  onToggleSelect: (itemId: string, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onEdit: (item: MenuItemView) => void;
  onDuplicate: (item: MenuItemView) => void;
  onTogglePublication: (item: MenuItemView) => void;
  onArchive: (item: MenuItemView) => void;
  onClearFilters: () => void;
  onAddProduct: () => void;
}

function Thumb({ image, name }: { image?: ImageReference; name: string }) {
  const [broken, setBroken] = useState(false);
  if (!image || broken) {
    return (
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 select-none items-center justify-center rounded-md border border-dashed border-border bg-muted/50 text-sm font-medium text-muted-foreground"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.url}
      alt={image.altText || name}
      width={image.width ?? 96}
      height={image.height ?? 96}
      onError={() => setBroken(true)}
      className="size-11 shrink-0 rounded-md border border-border bg-muted object-cover"
    />
  );
}

/**
 * The product table: one row per product on wide screens, stacked cards on
 * phones. Row actions stay reachable without scrolling horizontally.
 */
export function ProductList({
  loading,
  items,
  categories,
  selected,
  filtersActive,
  hasProducts,
  onToggleSelect,
  onToggleSelectAll,
  onEdit,
  onDuplicate,
  onTogglePublication,
  onArchive,
  onClearFilters,
  onAddProduct,
}: ProductListProps) {
  if (loading) {
    return (
      <ul className="flex flex-col divide-y" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <li key={index} className="flex items-center gap-3 py-3">
            <Skeleton className="size-4 shrink-0" />
            <Skeleton className="size-11 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-8 w-20" />
          </li>
        ))}
      </ul>
    );
  }

  if (items.length === 0) {
    if (filtersActive && hasProducts) {
      return (
        <Empty>
          <Search className="size-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-foreground">No products match your filters.</p>
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            Clear search and filters
          </Button>
        </Empty>
      );
    }
    return (
      <Empty>
        <p className="text-sm font-medium text-foreground">No products yet</p>
        <p className="text-xs text-muted-foreground">
          Products power your store, prices and the AI assistant.
        </p>
        <EmptyContent>
          <Button onClick={onAddProduct}>
            Add your first product
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const allSelected = selected.length > 0 && selected.length === items.length;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-border pb-2">
        <Checkbox
          aria-label="Select all products"
          checked={allSelected ? true : selected.length > 0 ? "indeterminate" : false}
          onCheckedChange={(checked) => onToggleSelectAll(checked === true)}
        />
        <span className="text-xs text-muted-foreground">
          {selected.length > 0
            ? `${selected.length} of ${items.length} selected`
            : "Select items for bulk actions"}
        </span>
      </div>
      <ul className="flex flex-col divide-y">
        {items.map((item) => {
          const image = item.imageReferences?.[0];
          const categoryName =
            categories.find((c) => c.categoryId === item.categoryId)?.name ?? "No category";
          const published = item.publicationStatus === "published";
          return (
            <li
              key={item.itemId}
              className={cn(
                "flex flex-wrap items-center gap-3 py-3 transition-colors",
                selected.includes(item.itemId) && "bg-primary/5"
              )}
            >
              <Checkbox
                aria-label={`Select ${item.name}`}
                checked={selected.includes(item.itemId)}
                onCheckedChange={(checked) => onToggleSelect(item.itemId, checked === true)}
              />
              <Thumb image={image} name={item.name} />

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground" title={item.name}>
                  {item.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatMoney(item.basePriceMinor)} &middot; {categoryName}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
                  <Badge variant={published ? "default" : "outline"}>
                    {published ? "Published" : "Draft"}
                  </Badge>
                  {item.availability !== "available" ? (
                    <Badge variant="warning">
                      {AVAILABILITY_LABEL[item.availability] ?? item.availability}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="hidden items-center gap-1.5 sm:flex">
                <Badge variant={published ? "default" : "outline"}>
                  {published ? "Published" : "Draft"}
                </Badge>
                <Badge
                  variant={
                    item.availability === "available"
                      ? "secondary"
                      : item.availability === "soldOut"
                        ? "warning"
                        : "outline"
                  }
                >
                  {AVAILABILITY_LABEL[item.availability] ?? item.availability}
                </Badge>
              </div>

              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Edit ${item.name}`}
                  onClick={() => onEdit(item)}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Copy ${item.name}`}
                  onClick={() => onDuplicate(item)}
                >
                  <Copy />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={published ? `Unpublish ${item.name}` : `Publish ${item.name}`}
                  title={published ? "Unpublish" : "Publish"}
                  onClick={() => onTogglePublication(item)}
                >
                  {published ? <EyeOff /> : <Eye />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Archive ${item.name}`}
                  title="Archive"
                  onClick={() => onArchive(item)}
                >
                  <Archive />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
