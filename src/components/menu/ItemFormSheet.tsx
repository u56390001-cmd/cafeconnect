"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2, Upload } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { authFetch } from "@/context/AuthContext";
import type { ImageReference } from "@/lib/media/images";
import {
  OptionGroupsEditor,
  type OptionGroupDraft,
} from "@/components/menu/OptionGroupsEditor";

export interface MenuItemDraft {
  itemId?: string;
  name: string;
  categoryId: string;
  priceRupees: string;
  description: string;
  aliases: string;
  spiceLevel: string;
  portion: string;
  dietaryLabels: string;
  availability: "available" | "soldOut" | "paused";
  publicationStatus: "draft" | "published";
  imageReferences: ImageReference[];
  optionGroups: OptionGroupDraft[];
}

export interface MenuCategoryOption {
  categoryId: string;
  name: string;
  status: string;
  sortOrder: number;
}

interface ItemFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  categories: MenuCategoryOption[];
  draft: MenuItemDraft | null;
  onSaved: (itemId: string) => void;
}

export function ItemFormSheet({
  open,
  onOpenChange,
  tenantId,
  categories,
  draft,
  onSaved,
}: ItemFormSheetProps) {
  const [form, setForm] = useState<MenuItemDraft | null>(draft);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(draft);
    setError("");
    setImageError("");
  }, [draft]);

  if (!form) return null;

  const isNew = !form.itemId;
  const activeCategories = categories.filter((c) => c.status === "active");

  async function upload(file: File) {
    if (!form?.itemId) {
      setImageError("Save the product first, then add a photo.");
      return;
    }
    setUploading(true);
    setImageError("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("altText", form.name);
      const res = await authFetch(
        `/api/menu/items/${form.itemId}/images?tenantId=${tenantId}`,
        { method: "POST", body }
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setImageError(
          payload?.error?.message ?? "The image could not be uploaded."
        );
        return;
      }
      setForm((current) =>
        current
          ? { ...current, imageReferences: payload.data.imageReferences ?? [] }
          : current
      );
    } catch {
      setImageError("The image could not be uploaded.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeImage(assetId: string) {
    if (!form?.itemId) return;
    setUploading(true);
    try {
      const res = await authFetch(
        `/api/menu/items/${form.itemId}/images/${assetId}?tenantId=${tenantId}`,
        { method: "DELETE" }
      );
      const payload = await res.json().catch(() => null);
      if (res.ok) {
        setForm((current) =>
          current
            ? { ...current, imageReferences: payload.data.imageReferences ?? [] }
            : current
        );
      } else {
        setImageError(payload?.error?.message ?? "The image could not be removed.");
      }
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form) return;
    if (!form.name.trim()) {
      setError("Give the product a name.");
      return;
    }
    if (!form.categoryId) {
      setError("Choose a category.");
      return;
    }
    const price = Number(form.priceRupees);
    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid price.");
      return;
    }

    // Option groups are validated before they are sent: a group without a name
    // or an option without a name would confuse the customer.
    const optionGroups = (form.optionGroups ?? [])
      .filter((group) => group.name.trim().length > 0)
      .map((group) => ({
        groupId: group.groupId,
        name: group.name.trim(),
        type: group.type,
        required: group.required,
        minSelections: group.required ? Math.max(1, group.minSelections) : group.minSelections,
        maxSelections: Math.max(group.required ? 1 : 0, group.maxSelections),
        active: true,
        options: group.options
          .filter((option) => option.name.trim().length > 0)
          .map((option) => ({
            optionId: option.optionId,
            name: option.name.trim(),
            priceDeltaMinor: Math.round(
              (Number(option.priceRupees) || 0) * 100
            ),
            active: option.active,
          })),
      }))
      .filter((group) => group.options.length > 0);
    if ((form.optionGroups ?? []).length !== optionGroups.length) {
      setError(
        "Each option group needs a name and at least one named option."
      );
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        tenantId,
        name: form.name.trim(),
        categoryId: form.categoryId,
        basePriceMinor: Math.round(price * 100),
        description: form.description.trim(),
        aliases: form.aliases
          .split(",")
          .map((alias) => alias.trim())
          .filter(Boolean),
        spiceLevel: form.spiceLevel.trim(),
        portion: form.portion.trim(),
        dietaryLabels: form.dietaryLabels
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean),
        availability: form.availability,
        publicationStatus: form.publicationStatus,
        optionGroups,
      };

      const res = await authFetch(
        isNew ? "/api/menu/items" : "/api/menu/items",
        {
          method: isNew ? "POST" : "PATCH",
          body: JSON.stringify(
            isNew ? payload : { ...payload, itemId: form.itemId }
          ),
        }
      );
      const result = await res.json().catch(() => null);
      if (!res.ok) {
        setError(result?.error?.message ?? "The product could not be saved.");
        return;
      }
      onSaved(result?.data?.itemId ?? form.itemId ?? "");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="text-base">
            {isNew ? "Add product" : "Edit product"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Check the details</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="item-name">Product name</Label>
              <Input
                id="item-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Chicken Biryani"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-category">Category</Label>
              <select
                id="item-category"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Choose a category</option>
                {activeCategories.map((category) => (
                  <option key={category.categoryId} value={category.categoryId}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-price">Price (PKR)</Label>
              <Input
                id="item-price"
                type="number"
                min={0}
                step={1}
                value={form.priceRupees}
                onChange={(e) => setForm({ ...form, priceRupees: e.target.value })}
                placeholder="350"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-description">Short description</Label>
              <Textarea
                id="item-description"
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="With leg piece, raita and salad"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-aliases">
                Search names / local aliases (comma separated)
              </Label>
              <Input
                id="item-aliases"
                value={form.aliases}
                onChange={(e) => setForm({ ...form, aliases: e.target.value })}
                placeholder="chicken biryani, biryani, ch"
              />
              <p className="text-xs text-muted-foreground">
                Helps customers and the AI agent match local spellings.
              </p>
            </div>

            <OptionGroupsEditor
              groups={form.optionGroups ?? []}
              onChange={(optionGroups) => setForm({ ...form, optionGroups })}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="item-availability">Availability</Label>
                <select
                  id="item-availability"
                  value={form.availability}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      availability: e.target.value as MenuItemDraft["availability"],
                    })
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="available">Available</option>
                  <option value="soldOut">Sold out</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-publication">Visibility</Label>
                <select
                  id="item-publication"
                  value={form.publicationStatus}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      publicationStatus: e.target
                        .value as MenuItemDraft["publicationStatus"],
                    })
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="item-spice">Spice level</Label>
                <Input
                  id="item-spice"
                  value={form.spiceLevel}
                  onChange={(e) =>
                    setForm({ ...form, spiceLevel: e.target.value })
                  }
                  placeholder="Mild to hot"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-portion">Portion / size</Label>
                <Input
                  id="item-portion"
                  value={form.portion}
                  onChange={(e) => setForm({ ...form, portion: e.target.value })}
                  placeholder="Half portion, serves 1"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-dietary">Dietary / allergen labels</Label>
              <Input
                id="item-dietary"
                value={form.dietaryLabels}
                onChange={(e) =>
                  setForm({ ...form, dietaryLabels: e.target.value })
                }
                placeholder="Contains nuts, gluten free"
              />
            </div>

            <div className="space-y-2">
              <Label>Photos</Label>
              {form.imageReferences.length > 0 ? (
                <ul className="flex flex-wrap gap-3">
                  {form.imageReferences.map((image) => (
                    <li key={image.assetId} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.url}
                        alt={image.altText || form.name}
                        width={image.width ?? 320}
                        height={image.height ?? 240}
                        className="size-24 rounded-md border border-border object-cover"
                      />
                      <button
                        type="button"
                        aria-label="Remove photo"
                        onClick={() => void removeImage(image.assetId)}
                        className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                      {image.isPrimary ? (
                        <Badge className="absolute bottom-1 left-1 text-[10px]">
                          Main
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  "Uploading…"
                ) : (
                  <>
                    <Upload data-icon="inline-start" />
                    Add photo
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                JPG, PNG or WebP up to 5 MB. Save the product first, then add a
                photo.
              </p>
              {imageError ? (
                <p className="text-sm text-destructive" role="alert">
                  {imageError}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border p-4">
          <Button onClick={() => void save()} disabled={saving || uploading}>
            {saving ? "Saving…" : isNew ? "Add product" : "Save changes"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            <ImagePlus className="mr-1 inline size-3.5" />
            Photos make the public menu look real
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
