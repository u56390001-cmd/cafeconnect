"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ChevronDown, RotateCcw, Search, Settings2, Utensils } from "lucide-react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { NoTenantNotice } from "@/components/dashboard/NoTenantNotice";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProductList, type MenuItemView } from "@/components/menu/product-list";
import { CategoryManager } from "@/components/menu/category-manager";
import {
  ItemFormSheet,
  type MenuCategoryOption,
  type MenuItemDraft,
} from "@/components/menu/ItemFormSheet";
import type { ProductOptionGroup } from "@/lib/domain/options";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Drafts" },
  { value: "soldOut", label: "Sold out" },
  { value: "paused", label: "Paused" },
] as const;

type SortKey = "manual" | "name" | "priceAsc" | "priceDesc";

type ItemDetailView = MenuItemView & {
  updatedAt?: string;
  optionGroups?: ProductOptionGroup[];
  // Detail fields persisted by the form (not shown inline).
  spiceLevel?: string;
  portion?: string;
  dietaryLabels?: string[];
};

export default function MenuPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [categories, setCategories] = useState<MenuCategoryOption[]>([]);
  const [items, setItems] = useState<ItemDetailView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("manual");
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<MenuItemDraft | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [archiveItem, setArchiveItem] = useState<ItemDetailView | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!tenantId) return;
    if (!silent) setLoading(true);
    try {
      const [catRes, itemRes] = await Promise.all([
        authFetch(`/api/menu/categories?tenantId=${tenantId}`),
        authFetch(`/api/menu/items?tenantId=${tenantId}`),
      ]);
      const catPayload = await catRes.json().catch(() => null);
      const itemPayload = await itemRes.json().catch(() => null);
      if (!catRes.ok || !itemRes.ok) {
        setError("The menu could not be loaded. Please try again.");
        return;
      }
      setCategories(catPayload.data?.categories ?? []);
      setItems(itemPayload.data?.items ?? []);
      setError("");
    } catch {
      setError("The menu could not be loaded. Please try again.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.status === "active"),
    [categories]
  );

  const itemsByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      if (item.status === "archived") continue;
      counts[item.categoryId] = (counts[item.categoryId] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (item.status === "archived") return false;
        if (categoryFilter !== "all" && item.categoryId !== categoryFilter)
          return false;
        if (statusFilter !== "all") {
          if (
            statusFilter === "published" &&
            item.publicationStatus !== "published"
          )
            return false;
          if (statusFilter === "draft" && item.publicationStatus !== "draft")
            return false;
          if (
            (statusFilter === "soldOut" || statusFilter === "paused") &&
            item.availability !== statusFilter
          )
            return false;
        }
        if (!needle) return true;
        return (
          item.name.toLowerCase().includes(needle) ||
          (item.description ?? "").toLowerCase().includes(needle) ||
          (item.aliases ?? []).some((alias) => alias.toLowerCase().includes(needle))
        );
      })
      .sort((a, b) => {
        if (sortKey === "name") return a.name.localeCompare(b.name);
        if (sortKey === "priceAsc") return a.basePriceMinor - b.basePriceMinor;
        if (sortKey === "priceDesc") return b.basePriceMinor - a.basePriceMinor;
        // manual: menu order the business controls (stable by name when unset)
        return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
      });
  }, [items, query, categoryFilter, statusFilter, sortKey]);

  const archivedItems = useMemo(
    () => items.filter((item) => item.status === "archived"),
    [items]
  );

  const publishedCount = items.filter(
    (item) => item.status !== "archived" && item.publicationStatus === "published"
  ).length;

  const filtersActive =
    query.trim() !== "" || categoryFilter !== "all" || statusFilter !== "all";

  async function addCategory(name: string) {
    if (!tenantId || !name) return;
    setError("");
    setBusy(true);
    try {
      const res = await authFetch("/api/menu/categories", {
        method: "POST",
        body: JSON.stringify({ tenantId, name }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error?.message ?? "The category could not be added.");
        return;
      }
      setNotice("Category added.");
      await load();
    } catch {
      setError("The category could not be added. Check the connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function renameCategory(categoryId: string, name: string) {
    if (!tenantId) return;
    setError("");
    try {
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
    } catch {
      setError("The category could not be renamed. Check the connection and retry.");
    }
  }

  async function moveCategory(categoryId: string, direction: -1 | 1) {
    if (!tenantId) return;
    const index = activeCategories.findIndex((c) => c.categoryId === categoryId);
    const neighbor = activeCategories[index + direction];
    if (!neighbor) return;
    setError("");
    try {
      const responses = await Promise.all([
        authFetch("/api/menu/categories", {
          method: "PATCH",
          body: JSON.stringify({
            tenantId,
            categoryId,
            sortOrder: neighbor.sortOrder,
          }),
        }),
        authFetch("/api/menu/categories", {
          method: "PATCH",
          body: JSON.stringify({
            tenantId,
            categoryId: neighbor.categoryId,
            sortOrder: activeCategories[index].sortOrder,
          }),
        }),
      ]);
      if (!responses[0].ok || !responses[1].ok) {
        setError("The category order could not be changed. Please try again.");
        await load();
        return;
      }
      await load();
    } catch {
      setError("The category order could not be changed. Please try again.");
    }
  }

  async function archiveCategory(
    categoryId: string,
    policy: "reassign" | "archive",
    reassignTo?: string
  ) {
    if (!tenantId) return;
    setError("");
    setBusy(true);
    try {
      const affected = items.filter(
        (item) => item.categoryId === categoryId && item.status !== "archived"
      ).length;
      const params = new URLSearchParams({
        tenantId,
        categoryId,
        itemPolicy: affected === 0 ? "keep" : policy,
      });
      if (affected > 0 && policy === "reassign") {
        if (!reassignTo) {
          setNotice("Category not archived — pick a target category first.");
          return;
        }
        params.set("reassignTo", reassignTo);
      }
      const res = await authFetch(
        `/api/menu/categories?${params.toString()}`,
        { method: "DELETE" }
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error?.message ?? "The category could not be archived.");
        return;
      }
      const moved = Number(payload.data?.itemsMoved ?? 0);
      const archived = Number(payload.data?.itemsArchived ?? 0);
      setNotice(
        moved > 0
          ? `Category archived. ${moved} product(s) moved out.`
          : archived > 0
            ? `Category archived with ${archived} product(s). Restore products below.`
            : "Category archived."
      );
      await load();
    } catch {
      setError("The category could not be archived. Check the connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreCategory(categoryId: string) {
    if (!tenantId) return;
    setError("");
    try {
      const res = await authFetch("/api/menu/categories", {
        method: "PATCH",
        body: JSON.stringify({ tenantId, categoryId, status: "active" }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error?.message ?? "The category could not be restored.");
        return;
      }
      setNotice("Category restored.");
      await load();
    } catch {
      setError("The category could not be restored. Check the connection and retry.");
    }
  }

  async function bulk(action: "publish" | "pause" | "restore", itemIds?: string[]) {
    if (!tenantId) return;
    const ids = itemIds ?? selected;
    if (ids.length === 0) return;
    setError("");
    setBusy(true);
    try {
      const res = await authFetch("/api/menu/items/bulk", {
        method: "POST",
        body: JSON.stringify({ tenantId, itemIds: ids, action }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error?.message ?? "That action could not be completed.");
        return;
      }
      setNotice(`${payload.data?.updated ?? 0} product(s) updated.`);
      setSelected([]);
      await load();
    } catch {
      setError("That action could not be completed. Check the connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublication(item: MenuItemView) {
    if (!tenantId || busy) return;
    const next = item.publicationStatus === "published" ? "draft" : "published";
    setError("");
    try {
      const res = await authFetch("/api/menu/items", {
        method: "PATCH",
        body: JSON.stringify({
          tenantId,
          itemId: item.itemId,
          publicationStatus: next,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error?.message ?? "The change could not be saved.");
        return;
      }
      setNotice(next === "published" ? "Product published." : "Product unpublished.");
      await load();
    } catch {
      setError("The change could not be saved. Check the connection and retry.");
    }
  }

  async function archiveProduct() {
    if (!tenantId || !archiveItem) return;
    setError("");
    setBusy(true);
    const target = archiveItem;
    setArchiveItem(null);
    try {
      const res = await authFetch(
        `/api/menu/items?tenantId=${tenantId}&itemId=${target.itemId}`,
        { method: "DELETE" }
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error?.message ?? "The product could not be archived.");
        return;
      }
      setNotice(`“${target.name}” archived. Restore it from Archived products.`);
      await load();
    } catch {
      setError("The product could not be archived. Check the connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function duplicateItem(item: MenuItemView) {
    if (!tenantId) return;
    setError("");
    setBusy(true);
    try {
      const res = await authFetch("/api/menu/items/duplicate", {
        method: "POST",
        body: JSON.stringify({ tenantId, itemId: item.itemId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error?.message ?? "The product could not be copied.");
        return;
      }
      setNotice("Product copied as a draft.");
      await load();
    } catch {
      setError("The product could not be copied. Check the connection and retry.");
    } finally {
      setBusy(false);
    }
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
      availability:
        (item.availability as MenuItemDraft["availability"]) ?? "available",
      publicationStatus:
        (item.publicationStatus as MenuItemDraft["publicationStatus"]) ?? "draft",
      imageReferences: item.imageReferences ?? [],
      optionGroups: ((item as ItemDetailView).optionGroups ?? []).map((group) => ({
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
      categoryId: categoryFilter !== "all" ? categoryFilter : activeCategories[0]?.categoryId ?? "",
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

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Utensils}
        title="Menu"
        description={
          loading
            ? undefined
            : `${publishedCount} published product${publishedCount === 1 ? "" : "s"} · published products power your store, the POS and your AI assistant.`
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
              <Settings2 data-icon="inline-start" />
              Manage categories
            </Button>
            <Button onClick={openNew} disabled={activeCategories.length === 0} title={activeCategories.length === 0 ? "Create a category first" : undefined}>
              + Add product
            </Button>
          </>
        }
      />

      {activeCategories.length === 0 && !loading ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-sm font-medium">Start with a category</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Categories group your menu, filter the POS grid and shape your
              storefront. Add one (for example “Biryani”, “Burgers”, “Drinks”).
            </p>
            <Button onClick={() => setCategoriesOpen(true)}>
              Manage categories
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Alert variant="destructive" className="[&>svg]:text-destructive">
          <AlertTitle>Something needs attention</AlertTitle>
          <AlertDescription>
            {error}
            <Button variant="outline" size="sm" className="ml-2" onClick={() => void load()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert>
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {/* Category chips */}
      <nav aria-label="Filter by category" className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setCategoryFilter("all")}
          aria-pressed={categoryFilter === "all"}
          className={chipClasses}
        >
          All
        </button>
        {activeCategories.map((category) => (
          <button
            key={category.categoryId}
            type="button"
            onClick={() => setCategoryFilter(category.categoryId === categoryFilter ? "all" : category.categoryId)}
            aria-pressed={categoryFilter === category.categoryId}
            className={chipClasses}
          >
            {category.name}
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] leading-4",
                categoryFilter === category.categoryId
                  ? "bg-white/20"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {itemsByCategory[category.categoryId] ?? 0}
            </span>
          </button>
        ))}
      </nav>

      {/* Products */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, descriptions, aliases"
                aria-label="Search products"
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <NativeSelect
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 sm:w-40"
              >
                {STATUS_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label="Sort products"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="h-10 sm:w-40"
              >
                <option value="manual">Menu order</option>
                <option value="name">Name A→Z</option>
                <option value="priceAsc">Price low→high</option>
                <option value="priceDesc">Price high→low</option>
              </NativeSelect>
            </div>
          </div>

          {selected.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
              <span className="text-sm font-medium">{selected.length} selected</span>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void bulk("publish")}>
                Publish
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void bulk("pause")}>
                Pause (hidden)
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setSelected([])}>
                Clear selection
              </Button>
            </div>
          ) : null}

          <ProductList
            loading={loading}
            items={visibleItems}
            categories={activeCategories}
            selected={selected}
            filtersActive={filtersActive}
            hasProducts={items.some((item) => item.status !== "archived")}
            onToggleSelect={(itemId, checked) =>
              setSelected((current) =>
                checked
                  ? [...current, itemId]
                  : current.filter((id) => id !== itemId)
              )
            }
            onToggleSelectAll={(checked) =>
              setSelected(checked ? visibleItems.map((item) => item.itemId) : [])
            }
            onEdit={openEdit}
            onDuplicate={(item) => void duplicateItem(item)}
            onTogglePublication={(item) => void togglePublication(item)}
            onArchive={(item) => setArchiveItem(item)}
            onClearFilters={() => {
              setQuery("");
              setCategoryFilter("all");
              setStatusFilter("all");
            }}
            onAddProduct={openNew}
          />

          {archivedItems.length > 0 && !loading ? (
            <details className="group rounded-md border border-border">
              <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2.5 text-sm font-medium hover:bg-muted/50">
                <ChevronDown
                  className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
                Archived products ({archivedItems.length})
              </summary>
              <ul className="flex flex-col divide-y border-t border-border">
                {archivedItems.map((item) => (
                  <li
                    key={item.itemId}
                    className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {item.name}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void bulk("restore", [item.itemId])}
                    >
                      <RotateCcw data-icon="inline-start" />
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>

      {/* Category management dialog */}
      <CategoryManager
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        categories={categories}
        itemsByCategory={itemsByCategory}
        onRename={(id, value) => void renameCategory(id, value)}
        onMove={(id, direction) => void moveCategory(id, direction)}
        onArchive={(id, policy, reassignTo) => void archiveCategory(id, policy, reassignTo)}
        onRestore={(id) => void restoreCategory(id)}
        onAdd={(name) => void addCategory(name)}
      />

      {/* Archive product confirmation */}
      <ConfirmDialog
        open={archiveItem !== null}
        onOpenChange={(open) => !open && setArchiveItem(null)}
        title="Archive this product?"
        description={`“${archiveItem?.name ?? ""}” will be hidden in your POS and store. You can restore it later from Archived products.`}
        destructive
        confirmLabel="Archive product"
        onConfirm={() => void archiveProduct()}
      />

      <ItemFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        tenantId={tenantId}
        categories={categories}
        draft={draft}
        onSaved={() => void load(true)}
      />
    </div>
  );
}

const chipClasses =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
