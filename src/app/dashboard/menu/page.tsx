"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Empty } from "@/components/ui/empty";

interface Category {
  categoryId: string;
  name: string;
}
interface MenuItem {
  itemId: string;
  categoryId: string;
  name: string;
  description: string;
  basePriceMinor: number;
  availability: string;
  publicationStatus: string;
}

const AVAILABILITY_OPTIONS = ["available", "soldOut", "paused"];

function MenuPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    price: "",
    description: "",
    availability: "available",
  });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError("");
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
      setError("Failed to load menu");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryName = (id: string) =>
    categories.find((c) => c.categoryId === id)?.name ?? "Unknown";

  async function addCategory() {
    if (!tenantId || !newCategory.trim()) return;
    const res = await authFetch("/api/menu/categories", {
      method: "POST",
      body: JSON.stringify({ tenantId, name: newCategory.trim() }),
    });
    if (res.ok) {
      setNewCategory("");
      await load();
    } else {
      setError("Failed to add category");
    }
  }

  async function removeCategory(id: string) {
    if (!tenantId) return;
    const res = await authFetch(
      `/api/menu/categories?tenantId=${tenantId}&categoryId=${id}`,
      { method: "DELETE" }
    );
    if (res.ok) await load();
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    setSaving(true);
    setError("");
    const priceMinor = Math.round(parseFloat(form.price) * 100);
    const payload = {
      tenantId,
      itemId: editId ?? undefined,
      categoryId: form.categoryId,
      name: form.name,
      description: form.description,
      basePriceMinor: priceMinor,
      availability: form.availability,
      publicationStatus: items.find((i) => i.itemId === editId)?.publicationStatus ?? "draft",
    };
    try {
      const res = await authFetch("/api/menu/items", {
        method: editId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setError(err?.error?.message ?? "Failed to save item");
      } else {
        setForm({ name: "", categoryId: "", price: "", description: "", availability: "available" });
        setEditId(null);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function patchItem(id: string, patch: Record<string, unknown>) {
    if (!tenantId) return;
    const res = await authFetch("/api/menu/items", {
      method: "PATCH",
      body: JSON.stringify({ tenantId, itemId: id, ...patch }),
    });
    if (res.ok) await load();
  }

  async function removeItem(id: string) {
    if (!tenantId) return;
    const res = await authFetch(
      `/api/menu/items?tenantId=${tenantId}&itemId=${id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      if (editId === id) setEditId(null);
      await load();
    }
  }

  function startEdit(item: MenuItem) {
    setEditId(item.itemId);
    setForm({
      name: item.name,
      categoryId: item.categoryId,
      price: (item.basePriceMinor / 100).toString(),
      description: item.description || "",
      availability: item.availability,
    });
  }

  if (!tenantId) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Menu</h1>
        <p className="text-sm text-muted-foreground">
          Manage categories and items. Published items power your AI assistant and store.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Badge key={c.categoryId} variant="secondary" className="gap-2 py-1.5 pl-3">
                  {c.name}
                  <button
                    aria-label={`Remove ${c.name}`}
                    onClick={() => removeCategory(c.categoryId)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2 max-w-md">
            <Label htmlFor="newCategory" className="sr-only">
              New category
            </Label>
            <Input
              id="newCategory"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="e.g. Burgers, Kebabs, Drinks"
            />
            <Button onClick={addCategory} disabled={!newCategory.trim()}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editId ? "Edit Item" : "Add New Item"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveItem} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="itemName">Name</Label>
              <Input
                id="itemName"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Chicken Biryani"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemCategory">Category</Label>
              <Select
                value={form.categoryId}
                onValueChange={(v) => setForm({ ...form, categoryId: v })}
                required
              >
                <SelectTrigger id="itemCategory">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.categoryId} value={c.categoryId}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemPrice">Price (PKR)</Label>
              <Input
                id="itemPrice"
                type="number"
                min="0"
                step="1"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="350"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="itemAvailability">Availability</Label>
              <Select
                value={form.availability}
                onValueChange={(v) => setForm({ ...form, availability: v })}
              >
                <SelectTrigger id="itemAvailability">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "soldOut" ? "Sold Out" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="itemDescription">Description (optional)</Label>
              <Input
                id="itemDescription"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Short description shown to customers"
              />
            </div>
            {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editId ? "Update Item" : "Add Item"}
              </Button>
              {editId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditId(null);
                    setForm({ name: "", categoryId: "", price: "", description: "", availability: "available" });
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Menu Items ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading menu...</p>
          ) : items.length === 0 ? (
            <Empty>
              <p>No menu items yet. Add items above to power your AI and store.</p>
            </Empty>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.itemId} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {categoryName(item.categoryId)} · PKR {Math.round(item.basePriceMinor / 100)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={item.publicationStatus === "published" ? "default" : "outline"}>
                      {item.publicationStatus === "published" ? "Published" : "Draft"}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={
                        item.availability === "soldOut"
                          ? "bg-destructive/10 text-destructive border-destructive/30"
                          : item.availability === "paused"
                            ? "bg-warning/10 text-warning border-warning/30"
                            : "bg-success/10 text-success border-success/30"
                      }
                    >
                      {item.availability === "soldOut" ? "Sold Out" : item.availability}
                    </Badge>
                    <Switch
                      checked={item.publicationStatus === "published"}
                      onCheckedChange={(checked) =>
                        patchItem(item.itemId, { publicationStatus: checked ? "published" : "draft" })
                      }
                      aria-label={`Publish ${item.name}`}
                    />
                    <Button size="sm" variant="outline" onClick={() => startEdit(item)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeItem(item.itemId)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Page() {
  return <MenuPage />;
}
