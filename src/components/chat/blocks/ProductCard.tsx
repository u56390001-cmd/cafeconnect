"use client";

import { ImageOff, ShoppingBag, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WidgetProduct } from "@/lib/widget/ui-contract";

interface ProductCardProps {
  product: WidgetProduct;
  onAdd: (product: WidgetProduct) => void;
  onConfigure: (product: WidgetProduct) => void;
  showImages: boolean;
  currency?: string;
}

function priceLabel(product: WidgetProduct): string {
  return product.priceLabel || `${product.currency} ${Math.round(product.priceMinor / 100)}`;
}

export function ProductCard({
  product,
  onAdd,
  onConfigure,
  showImages,
}: ProductCardProps) {
  const soldOut = product.availability !== "available";
  const hasOptions = product.hasOptions && product.optionGroups.length > 0;

  return (
    <article className="flex h-full w-[15rem] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border bg-card sm:w-[17rem]">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {showImages && product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.imageAlt || product.name}
            width={product.imageWidth ?? 400}
            height={product.imageHeight ?? 300}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageOff className="size-5" aria-hidden="true" />
            <span className="text-[11px]">No photo yet</span>
          </div>
        )}
        {soldOut ? (
          <Badge
            variant="secondary"
            className="absolute left-2 top-2 bg-background/90 text-foreground"
          >
            Sold out
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-snug">{product.name}</h3>
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
            {priceLabel(product)}
          </span>
        </div>

        {product.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {product.description}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {hasOptions ? (
            <Button
              size="sm"
              className="h-9"
              disabled={soldOut}
              onClick={() => onConfigure(product)}
            >
              <SlidersHorizontal data-icon="inline-start" />
              Choose options
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-9"
              disabled={soldOut}
              onClick={() => onAdd(product)}
            >
              <ShoppingBag data-icon="inline-start" />
              {soldOut ? "Sold out" : "Add"}
            </Button>
          )}
          {hasOptions ? (
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              disabled={soldOut}
              onClick={() => onAdd(product)}
            >
              Add
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

interface ProductCarouselProps {
  products: WidgetProduct[];
  onAdd: (product: WidgetProduct) => void;
  onConfigure: (product: WidgetProduct) => void;
  showImages: boolean;
  layout: "carousel" | "list";
}

/**
 * Horizontal carousel for small, related sets; vertical list for longer
 * results. Scrolling is discoverable, touch friendly and keyboard
 * reachable - it never auto-advances.
 */
export function ProductCarousel({
  products,
  onAdd,
  onConfigure,
  showImages,
  layout,
}: ProductCarouselProps) {
  if (layout === "list") {
    return (
      <ul className="flex flex-col gap-2">
        {products.map((product) => (
          <li key={product.itemId} className="flex gap-3 rounded-xl border border-border bg-card p-2">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
              {showImages && product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.imageUrl}
                  alt={product.imageAlt || product.name}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-snug">{product.name}</p>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                  {priceLabel(product)}
                </span>
              </div>
              {product.description ? (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {product.description}
                </p>
              ) : null}
              <div className="mt-1.5 flex flex-wrap gap-2">
                {product.hasOptions ? (
                  <Button size="sm" className="h-8" onClick={() => onConfigure(product)}>
                    Choose options
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant={product.hasOptions ? "outline" : "default"}
                  className="h-8"
                  disabled={product.availability !== "available"}
                  onClick={() => onAdd(product)}
                >
                  Add
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      role="group"
      aria-label="Suggested items"
      className={cn(
        "-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1",
        "[scrollbar-width:thin]"
      )}
    >
      {products.map((product) => (
        <ProductCard
          key={product.itemId}
          product={product}
          onAdd={onAdd}
          onConfigure={onConfigure}
          showImages={showImages}
        />
      ))}
    </div>
  );
}
