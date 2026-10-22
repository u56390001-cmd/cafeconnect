"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArrowDown, ArrowUp, Copy, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Empty } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { NoTenantNotice } from "@/components/dashboard/NoTenantNotice";
import {
  ItemFormSheet,
  type MenuCategoryOption,
  type MenuItemDraft,
} from "@/components/menu/ItemFormSheet";
import { formatMoney } from "@/lib/domain/money";
import type { ImageReference } from "@/lib/media/images";
import type { ProductOptionGroup } from "@/lib/domain/options";

interface MenuItemView {
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
  spiceLevel: string;
  dietaryLabels: string[];
  portion: string;
  imageReferences: ImageReference[];
  optionGroups?: ProductOptionGroup[];
}

const AVAILABILITY_LABEL: Record<string, string> = {
  available: "Available",
  soldOut: "Sold out",
  paused: "Paused",
};

export default function MenuPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [categories, setCategories] = useState<MenuCategoryOption[]>([]);
  const [items, setItems] = useState<MenuItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<MenuItemDraft | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [catRes, itemRes] = await Promise.all([
        authFetch(`/api/menu/categories?tenantId=${tenantId}`),
        authFetch(`/api/menu/items?tenantId=${tenantId}`),
      ]);
      if (catRes.ok) {
        const data = await catRes.json();
        setCategories(data.data?.categories ?? []);
      }
      if (itemRes.ok) {
        const data = await itemRes.json();
        setItems(data.data?.items ?? []);
      }
    } catch {
      setError("The menu could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.status === "active"),
    [categories]
  );

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (item.status === "archived") return false;
        if (categoryFilter !== "all" && item.categoryId !== categoryFilter)
          return false;
        if (!needle) return true;
        return (
          item.name.toLowerCase().includes(needle) ||
          item.description.toLowerCase().includes(needle) ||
          item.aliases.some((alias) => alias.includes(needle))
        );
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [items, query, categoryFilter]);

  const archivedItems = useMemo(
    () => items.filter((item) => item.status === "archived"),
    [items]
  );

  async function addCategory() {
    if (!tenantId || !newCategory.trim()) return;
    setError("");
    const res = await authFetch("/api/menu/categories", {
      method: "POST",
      body: JSON.stringify({ tenantId, name: newCategory.trim() }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error?.message ?? "The category could not be added.");
      return;
    }
    setNewCategory("");
    await load();
  }

  async function renameCategory(categoryId: string, name: string) {
    if (!tenantId) return;
    const res = await authFetch("/api/menu/categories", {
      method: "PATCH",
      body: JSON.stringify({ tenantId, categoryId, name }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error?.message ?? "The category could not be renamed.");
      return;
    }
    setNotice("Category renamed.");
    await load();
  }

  async function moveCategory(categoryId: string, direction: -1 | 1) {
    if (!tenantId) return;
    const index = activeCategories.findIndex((c) => c.categoryId === categoryId);
    const neighbour = activeCategories[index + direction];
    if (!neighbour) return;
    await Promise.all([
      authFetch("/api/menu/categories", {
        method: "PATCH",
        body: JSON.stringify({
          tenantId,
          categoryId,
          sortOrder: neighbour.sortOrder,
        }),
      }),
      authFetch("/api/menu/categories", {
        method: "PATCH",
        body: JSON.stringify({
          tenantId,
          categoryId: neighbour.categoryId,
          sortOrder: activeCategories[index].sortOrder,
        }),
      }),
    ]);
    await load();
  }

  async function archiveCategory(categoryId: string) {
    if (!tenantId) return;
    const affected = items.filter(
      (item) => item.categoryId === categoryId && item.status !== "archived"
    );
    const others = activeCategories.filter((c) => c.categoryId !== categoryId);

    const policy =
      affected.length === 0
        ? "keep"
        : others.length > 0
          ? "reassign"
          : "archive";

    if (policy === "reassign") {
      const target = window.prompt(
        `This category has ${affected.length} product(s). Move them to which category?\n\n${others
          .map((c, i) => `${i + 1}. ${c.name}`)
          .join("\n")}\n\nType the number:`,
        "1"
      );
      const choice = Number(target);
      const chosen = others[choice - 1];
      if (!chosen) {
        setNotice("Category not archived - no target category chosen.");
        return;
      }
      const res = await authFetch(
        `/api/menu/categories?tenantId=${tenantId}&categoryId=${categoryId}&itemPolicy=reassign&reassignTo=${chosen.categoryId}`,
        { method: "DELETE" }
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error?.message ?? "The category could not be archived.");
        return;
      }
      setNotice(
        `Category archived. ${affected.length} product(s) moved to ${chosen.name}.`
      );
    } else {
      const res = await authFetch(
        `/api/menu/categories?tenantId=${tenantId}&categoryId=${categoryId}&itemPolicy=archive`,
        { method: "DELETE" }
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error?.message ?? "The category could not be archived.");
        return;
      }
      setNotice(
        affected.length > 0
          ? `Category archived and ${affected.length} product(s) archived with it. You can restore them below.`
          : "Category archived."
      );
    }
    await load();
  }

  async function restoreCategory(categoryId: string) {
    if (!tenantId) return;
    await authFetch("/api/menu/categories", {
      method: "PATCH",
      body: JSON.stringify({ tenantId, categoryId, status: "active" }),
    });
    setNotice("Category restored.");
    await load();
  }

  async function bulk(action: "publish" | "pause" | "restore") {
    if (!tenantId || selected.length === 0) return;
    const res = await authFetch("/api/menu/items/bulk", {
      method: "POST",
      body: JSON.stringify({ tenantId, itemIds: selected, action }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error?.message ?? "That action could not be completed.");
      return;
    }
    setNotice(`${payload.data?.updated ?? 0} product(s) updated.`);
    setSelected([]);
    await load();
  }

  async function duplicateItem(itemId: string) {
    if (!tenantId) return;
    const res = await authFetch("/api/menu/items/duplicate", {
      method: "POST",
      body: JSON.stringify({ tenantId, itemId }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      setError(payload?.error?.message ?? "The product could not be copied.");
      return;
    }
    setNotice("Product copied as a draft.");
    await load();
  }

  function openEdit(item: MenuItemView) {
    setDraft({
      itemId: item.itemId,
      name: item.name,
      categoryId: item.categoryId,
      priceRupees: String(item.basePriceMinor / 100),
      description: item.description ?? "",
      aliases: (item.aliases ?? []).join(", "),
      spiceLevel: item.spiceLevel ?? "",
      portion: item.portion ?? "",
      dietaryLabels: (item.dietaryLabels ?? []).join(", "),
      availability: (item.availability as MenuItemDraft["availability"]) ?? "available",
      publicationStatus:
        (item.publicationStatus as MenuItemDraft["publicationStatus"]) ?? "draft",
      imageReferences: item.imageReferences ?? [],
      optionGroups: (item.optionGroups ?? []).map((group) => ({
        groupId: group.groupId,
        name: group.name,
        type: group.type,
        required: group.required,
        minSelections: group.minSelections,
        maxSelections: group.maxSelections,
        options: group.options.map((option) => ({
          optionId: option.optionId,
          name: option.name,
          priceRupees: String(option.priceDeltaMinor / 100),
          active: option.active,
        })),
      })),
    });
    setSheetOpen(true);
  }

  function openNew() {
    setDraft({
      name: "",
      categoryId: activeCategories[0]?.categoryId ?? "",
      priceRupees: "",
      description: "",
      aliases: "",
      spiceLevel: "",
      portion: "",
      dietaryLabels: "",
      availability: "available",
      publicationStatus: "published",
      imageReferences: [],
      optionGroups: [],
    });
    setSheetOpen(true);
  }

  if (!tenantId) return <NoTenantNotice />;

  const publishedCount = items.filter(
    (item) =>
      item.status !== "archived" && item.publicationStatus === "published"
  ).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Menu</h1>
          <p className="text-sm text-muted-foreground">
            {publishedCount} published product{publishedCount === 1 ? "" : "s"} ·
            published products power your store, your AI assistant and search.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus data-icon="inline-start" />
          Add product
        </Button>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert>
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categories</CardTitle>
          <CardDescription>
            Order here is the order customers see. Archiving asks what should
            happen to the products inside.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {activeCategories.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {activeCategories.map((category, index) => (
                <li
                  key={category.categoryId}
                  className="flex flex-wrap items-center gap-2"
                >
                  <Label htmlFor={`cat-${category.categoryId}`} className="sr-only">
                    Category name
                  </Label>
                  <Input
                    id={`cat-${category.categoryId}`}
                    defaultValue={category.name}
                    className="h-9 max-w-xs"
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value && value !== category.name) {
                        void renameCategory(category.categoryId, value);
                      }
                    }}
                  />
                  <Badge variant="secondary">
                    {items.filter(
                      (item) =>
                        item.categoryId === category.categoryId &&
                        item.status !== "archived"
                    ).length}{" "}
                    products
                  </Badge>
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Move ${category.name} up`}
                      disabled={index === 0}
                      onClick={() => void moveCategory(category.categoryId, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Move ${category.name} down`}
                      disabled={index === activeCategories.length - 1}
                      onClick={() => void moveCategory(category.categoryId, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void archiveCategory(category.categoryId)}
                    >
                      <Archive data-icon="inline-start" />
                      Archive
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add your first category (for example Biryani, Shauarma, Drinks).
            </p>
          )}

          <Separator />

          <div className="flex max-w-md gap-2">
            <Label htmlFor="newCategory" className="sr-only">
              New category
            </Label>
            <Input
              id="newCategory"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="e.g. Burgers, Kebabs, Drinks"
            />
            <Button onClick={() => void addCategory()} disabled={!newCategory.trim()}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Products ({visibleItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, aliases"
                aria-label="Search products"
                className="pl-9"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter by category"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm sm:max-w-[200px]"
            >
              <option value="all">All categories</option>
              {activeCategories.map((category) => (
                <option key={category.categoryId} value={category.categoryId}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {selected.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
              <span className="text-sm">{selected.length} selected</span>
              <Button size="sm" variant="outline" onClick={() => void bulk("publish")}>
                Publish
              </Button>
              <Button size="sm" variant="outline" onClick={() => void bulk("pause")}>
                Pause
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading products...</p>
          ) : visibleItems.length === 0 ? (
            <Empty>
              <p>No products match.</p>
              <p className="text-xs text-muted-foreground">
                Add a product or clear the search.
              </p>
            </Empty>
          ) : (
            <ul className="flex flex-col divide-y">
              {visibleItems.map((item) => {
                const image = item.imageReferences?.[0];
                return (
                  <li key={item.itemId} className="flex flex-wrap items-center gap-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.name}`}
                      checked={selected.includes(item.itemId)}
                      onChange={(e) =>
                        setSelected((current) =>
                          e.target.checked
                            ? [...current, item.itemId]
                            : current.filter((id) => id !== item.itemId)
                        )
                      }
                      className="size-4"
                    />
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={image.url}
                        alt={image.altText || item.name}
                        width={image.width ?? 96}
                        height={image.height ?? 96}
                        className="size-12 shrink-0 rounded-md border border-border object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex size-12 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground"
                      >
                        No photo
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(item.basePriceMinor)} ·{" "}
                        {activeCategories.find(
                          (c) => c.categoryId === item.categoryId
                        )?.name ?? "No category"}
                      </p>
                    </div>
                    <Badge
                      variant={
                        item.publicationStatus === "published"
                          ? "default"
                          : "outline"
                      }
                    >
                      {item.publicationStatus}
                    </Badge>
                    <Badge
                      variant={
                        item.availability === "available" ? "secondary" : "outline"
                      }
                    >
                      {AVAILABILITY_LABEL[item.availability] ?? item.availability}
                    </Badge>
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${item.name}`}
                        onClick={() => openEdit(item)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Copy ${item.name}`}
                        onClick={() => void duplicateItem(item.itemId)}
                      >
                        <Copy />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {archivedItems.length > 0 ? (
            <>
              <Separator />
              <div>
                <p className="mb-2 text-sm font-medium">
                  Archived products ({archivedItems.length})
                </p>
                <ul className="flex flex-col gap-2">
                  {archivedItems.map((item) => (
                    <li
                      key={item.itemId}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void bulk("restore")}
                        disabled={selected.length === 0}
                      >
                        <RotateCcw data-icon="inline-start" />
                        Restore selected
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <ItemFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        tenantId={tenantId}
        categories={categories}
        draft={draft}
        onSaved={() => {
          setNotice("Product saved.");
          void load();
        }}
      />
    </div>
  );
}
