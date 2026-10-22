"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { authFetch } from "@/context/AuthContext";
import type { ImageReference } from "@/lib/media/images";
import {
  OptionGroupsEditor,
  type OptionGroupDraft,
} from "@/components/menu/OptionGroupsEditor";
import { ItemPhotos } from "@/components/menu/item-photos";

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
  itemCount?: number;
}

interface ItemFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  categories: MenuCategoryOption[];
  draft: MenuItemDraft | null;
  onSaved: (itemId: string) => void;
}

const selectClasses =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

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
  const [createdNotice, setCreatedNotice] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);

  // Baseline of the form as opened/last-saved, to detect unsaved edits.
  const [baseline, setBaseline] = useState<string>("");
  const dirty = useMemo(
    () => Boolean(form) && JSON.stringify(form) !== baseline,
    [form, baseline]
  );

  useEffect(() => {
    setForm(draft);
    setError("");
    setImageError("");
    setCreatedNotice("");
    setDiscardOpen(false);
    setBaseline(draft ? JSON.stringify(draft) : "");
  }, [draft]);

  // Protect unsaved work against closing the browser tab/refreshing too.
  useEffect(() => {
    if (!open || !dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [open, dirty]);

  if (!form) return null;

  const isNew = !form.itemId;
  const activeCategories = categories.filter((c) => c.status === "active");
  const activeGroups = createCleanGroups(form.optionGroups ?? []);

  function requestClose() {
    if (saving) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  }

  async function upload(file: File) {
    if (!form?.itemId) {
      setImageError("Save the product first, then add photos.");
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
        setImageError(payload?.error?.message ?? "The image could not be uploaded.");
        return;
      }
      const nextForm = { ...form, imageReferences: payload.data.imageReferences ?? [] };
      setForm(nextForm);
      setBaseline(JSON.stringify(nextForm));
    } catch {
      setImageError("The image could not be uploaded. Check the connection and retry.");
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(assetId: string) {
    if (!form?.itemId) return;
    setUploading(true);
    setImageError("");
    try {
      const res = await authFetch(
        `/api/menu/items/${form.itemId}/images/${assetId}?tenantId=${tenantId}`,
        { method: "DELETE" }
      );
      const payload = await res.json().catch(() => null);
      if (res.ok) {
        const nextForm = { ...form, imageReferences: payload.data.imageReferences ?? [] };
        setForm(nextForm);
        setBaseline(JSON.stringify(nextForm));
      } else {
        setImageError(payload?.error?.message ?? "The image could not be removed.");
      }
    } catch {
      setImageError("The image could not be removed. Check the connection and retry.");
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
    if ((form.optionGroups ?? []).length !== activeGroups.length) {
      setError("Each option group needs a name and at least one named option.");
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
        aliases: splitList(form.aliases),
        spiceLevel: form.spiceLevel.trim(),
        portion: form.portion.trim(),
        dietaryLabels: splitList(form.dietaryLabels),
        availability: form.availability,
        publicationStatus: form.publicationStatus,
        optionGroups: toGroupPayload(form.optionGroups ?? []),
      };

      // A pointless post-loop ternary here invites drift; the method below
      // is the only difference between create and update.
      const res = await authFetch("/api/menu/items", {
        method: isNew ? "POST" : "PATCH",
        body: JSON.stringify(
          isNew ? payload : { ...payload, itemId: form.itemId }
        ),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok) {
        setError(result?.error?.message ?? "The product could not be saved.");
        return;
      }

      onSaved(result?.data?.itemId ?? form.itemId ?? "");
      if (isNew) {
        // Keep the drawer open: brand-new products can only carry photos,
        // option pricing hints, etc. after they exist.
        const itemId = String(result?.data?.itemId ?? "");
        const nextForm = { ...form, itemId };
        setForm(nextForm);
        setBaseline(JSON.stringify(nextForm));
        setCreatedNotice("Product created. You can now add photos and options, then save again.");
      } else {
        setBaseline(JSON.stringify(form));
        onOpenChange(false);
      }
    } catch {
      setError("The product could not be saved. Check the connection and retry.");
    } finally {
      setSaving(false);
    }
  }

  const optionSummary =
    activeGroups.length > 0
      ? `Options & details — ${activeGroups.length} option group${activeGroups.length === 1 ? "" : "s"}`
      : "Options & details";

  const photoDisabled = !form.itemId;
  const photoDisabledReason = photoDisabled
    ? "New product — save first to add photos"
    : "";

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border bg-secondary/50 px-5 py-4">
          <SheetTitle className="text-lg">
            {isNew ? "Add product" : `Edit: ${form.name || "product"}`}
          </SheetTitle>
        </SheetHeader>

        <div
          id="item-form-scroll"
          className="flex-1 overflow-y-auto px-5 py-5"
        >
          <div className="flex flex-col gap-5">
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Check the details</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {createdNotice ? (
              <Alert variant="success">
                <AlertTitle>Product created</AlertTitle>
                <AlertDescription>{createdNotice}</AlertDescription>
              </Alert>
            ) : null}

            {/* ---------------- Basic information ---------------- */}
            <section className="space-y-4" aria-label="Basic information">
              <div className="space-y-1.5">
                <Label htmlFor="item-name">Product name</Label>
                <Input
                  id="item-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Chicken Biryani"
                  autoFocus
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="item-category">Category</Label>
                  <select
                    id="item-category"
                    value={form.categoryId}
                    onChange={(e) =>
                      setForm({ ...form, categoryId: e.target.value })
                    }
                    className={selectClasses}
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
                    onChange={(e) =>
                      setForm({ ...form, priceRupees: e.target.value })
                    }
                    placeholder="350"
                  />
                </div>
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
            </section>

            {/* ---------------- Photos ---------------- */}
            <section className="space-y-2 border-t border-border pt-5" aria-label="Photos">
              <ItemPhotos
                images={form.imageReferences ?? []}
                productName={form.name}
                disabled={photoDisabled}
                disabledReason={photoDisabledReason}
                uploading={uploading}
                error={imageError}
                onUpload={(file) => void upload(file)}
                onRemove={(assetId) => void removeImage(assetId)}
              />
            </section>

            {/* ---------------- Availability ---------------- */}
            <section className="space-y-4 border-t border-border pt-5" aria-label="Availability">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="item-availability">Availability</Label>
                  <select
                    id="item-availability"
                    value={form.availability}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        availability: e.target
                          .value as MenuItemDraft["availability"],
                      })
                    }
                    className={selectClasses}
                  >
                    <option value="available">Available</option>
                    <option value="soldOut">Sold out</option>
                    <option value="paused">Paused</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Sold out: stays visible but cannot be ordered. Paused: hidden everywhere.
                  </p>
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
                    className={selectClasses}
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Drafts never appear on your store or in the AI assistant.
                  </p>
                </div>
              </div>
            </section>

            {/* ---------------- Advanced (collapsed by default) ---------------- */}
            <details className="group rounded-md border border-border">
              <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/50">
                <ChevronDown
                  className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
                {optionSummary}
              </summary>
              <div className="flex flex-col gap-5 border-t border-border px-4 py-4">
                <div className="space-y-1.5">
                  <Label htmlFor="item-aliases">
                    Search names / local aliases (comma separated)
                  </Label>
                  <Input
                    id="item-aliases"
                    value={form.aliases}
                    onChange={(e) =>
                      setForm({ ...form, aliases: e.target.value })
                    }
                    placeholder="chicken biryani, biryani, ch"
                  />
                  <p className="text-xs text-muted-foreground">
                    Helps customers and the AI agent match local spellings.
                  </p>
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
                      onChange={(e) =>
                        setForm({ ...form, portion: e.target.value })
                      }
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

                <OptionGroupsEditor
                  groups={form.optionGroups ?? []}
                  onChange={(optionGroups) =>
                    setForm({ ...form, optionGroups })
                  }
                />
              </div>
            </details>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-background px-5 py-4">
          <Button onClick={() => void save()} disabled={saving || uploading}>
            {saving ? "Saving…" : isNew ? "Add product" : "Save changes"}
          </Button>
          <Button variant="outline" onClick={requestClose}>
            Cancel
          </Button>
          {dirty && isNew ? (
            <span className="ml-auto text-xs text-muted-foreground">
              Tip: press Save first, then add photos.
            </span>
          ) : null}
        </div>
      </SheetContent>

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        destructive
        title="Discard unsaved changes?"
        description="Your field edits have not been saved and will be lost. Uploaded photos are already stored on the server."
        confirmLabel="Discard changes"
        onConfirm={() => {
          setDiscardOpen(false);
          onOpenChange(false);
        }}
      />
    </Sheet>
  );
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createCleanGroups(groups: OptionGroupDraft[]) {
  return groups
    .filter((group) => group.name.trim().length > 0)
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => option.name.trim().length > 0),
    }))
    .filter((group) => group.options.length > 0);
}

function toGroupPayload(groups: OptionGroupDraft[]) {
  return groups
    .filter((group) => group.name.trim().length > 0)
    .map((group) => ({
      groupId: group.groupId,
      name: group.name.trim(),
      type: group.type,
      required: group.required,
      minSelections: group.required
        ? Math.max(1, group.minSelections)
        : group.minSelections,
      maxSelections: Math.max(group.required ? 1 : 0, group.maxSelections),
      active: true,
      options: group.options
        .filter((option) => option.name.trim().length > 0)
        .map((option) => ({
          optionId: option.optionId,
          name: option.name.trim(),
          priceDeltaMinor: Math.round((Number(option.priceRupees) || 0) * 100),
          active: option.active,
        })),
    }))
    .filter((group) => group.options.length > 0);
}
