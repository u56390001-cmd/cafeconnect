"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Archive, Plus, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { NativeSelect } from "@/components/ui/native-select";
import type { MenuCategoryOption } from "@/components/menu/ItemFormSheet";

interface CategoryManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: MenuCategoryOption[];
  itemsByCategory: Record<string, number>;
  onRename: (categoryId: string, value: string) => void;
  onMove: (categoryId: string, direction: -1 | 1) => void;
  onArchive: (
    categoryId: string,
    policy: "reassign" | "archive",
    reassignTo?: string
  ) => void;
  onRestore: (categoryId: string) => void;
  onAdd: (name: string) => void;
}

/**
 * Category management dialog. Replaces the old inline form + window.prompt
 * archive flow: renames, reorders, adds, restores and archives categories
 * with an explicit, accessible decision about the products inside.
 */
export function CategoryManager({
  open,
  onOpenChange,
  categories,
  itemsByCategory,
  onRename,
  onMove,
  onArchive,
  onRestore,
  onAdd,
}: CategoryManagerProps) {
  const [newName, setNewName] = useState("");
  const [archiveCategoryId, setArchiveCategoryId] = useState<string | null>(null);
  const [archivePolicy, setArchivePolicy] = useState<"reassign" | "archive">("reassign");
  const [reassignTo, setReassignTo] = useState("");

  const activeCategories = categories.filter((c) => c.status === "active");
  const archivedCategories = categories.filter((c) => c.status !== "active");
  const archivingCategory = activeCategories.find(
    (c) => c.categoryId === archiveCategoryId
  );

  useEffect(() => {
    if (open) {
      setNewName("");
      setArchiveCategoryId(null);
      setArchivePolicy("reassign");
      setReassignTo("");
    }
  }, [open]);

  // When archiving opens, default the reassign target to the first other category.
  useEffect(() => {
    if (!archivingCategory) return;
    const other = activeCategories.find(
      (c) => c.categoryId !== archivingCategory.categoryId
    );
    setReassignTo(other?.categoryId ?? "");
  }, [archivingCategory, activeCategories]);

  const affectedCount = archivingCategory
    ? itemsByCategory[archivingCategory.categoryId] ?? 0
    : 0;
  const canReassign =
    activeCategories.filter((c) => c.categoryId !== archiveCategoryId).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage categories</DialogTitle>
          <DialogDescription>
            The order below is the order customers see in your store and in the POS.
          </DialogDescription>
        </DialogHeader>

        {archivingCategory ? (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium">
              Archive “{archivingCategory.name}”
            </p>
            {affectedCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                This category has no products. Archiving only hides the category.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {affectedCount} product{affectedCount === 1 ? "" : "s"} use this category.
                  What should happen to them?
                </p>
                <ul className="space-y-2 text-sm">
                  {canReassign ? (
                    <li className="flex flex-wrap items-center gap-2">
                      <input
                        type="radio"
                        id="cat-policy-reassign"
                        name="cat-policy"
                        checked={archivePolicy === "reassign"}
                        onChange={() => setArchivePolicy("reassign")}
                        className="size-4"
                      />
                      <Label htmlFor="cat-policy-reassign" className="shrink-0">
                        Move them to
                      </Label>
                      <NativeSelect
                        aria-label="Target category"
                        disabled={archivePolicy !== "reassign"}
                        value={reassignTo}
                        onChange={(e) => setReassignTo(e.target.value)}
                        className="w-auto min-w-40 h-9"
                      >
                        {activeCategories
                          .filter((c) => c.categoryId !== archivingCategory.categoryId)
                          .map((category) => (
                            <option key={category.categoryId} value={category.categoryId}>
                              {category.name}
                            </option>
                          ))}
                      </NativeSelect>
                    </li>
                  ) : null}
                  <li className="flex items-center gap-2">
                    <input
                      type="radio"
                      id="cat-policy-archive"
                      name="cat-policy"
                      checked={archivePolicy === "archive"}
                      onChange={() => setArchivePolicy("archive")}
                      className="size-4"
                    />
                    <Label htmlFor="cat-policy-archive">
                      Archive the {affectedCount} product{affectedCount === 1 ? "" : "s"} too (restorable later)
                    </Label>
                  </li>
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setArchiveCategoryId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  onArchive(
                    archivingCategory.categoryId,
                    affectedCount === 0 ? "reassign" : archivePolicy,
                    affectedCount === 0 ? undefined : reassignTo
                  );
                  setArchiveCategoryId(null);
                }}
              >
                <Archive data-icon="inline-start" />
                Archive category
              </Button>
            </div>
          </div>
        ) : (
          <>
            {activeCategories.length > 0 ? (
              <ul className="space-y-1">
                {activeCategories.map((category, index) => (
                  <li
                    key={category.categoryId}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2 py-2"
                  >
                    <Input
                      id={`cat-${category.categoryId}`}
                      defaultValue={category.name}
                      className="h-9 max-w-[220px]"
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value && value !== category.name) {
                          onRename(category.categoryId, value);
                        }
                      }}
                    />
                    <Badge variant="secondary">
                      {itemsByCategory[category.categoryId] ?? 0} product
                      {(itemsByCategory[category.categoryId] ?? 0) === 1 ? "" : "s"}
                    </Badge>
                    <div className="ml-auto flex items-center gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move ${category.name} up`}
                        disabled={index === 0}
                        onClick={() => onMove(category.categoryId, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move ${category.name} down`}
                        disabled={index === activeCategories.length - 1}
                        onClick={() => onMove(category.categoryId, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Archive ${category.name}`}
                        title="Archive"
                        onClick={() => setArchiveCategoryId(category.categoryId)}
                      >
                        <Archive />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Add your first category — for example Biryani, Shauarma, Drinks.
              </p>
            )}

            <Separator />

            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="new-category-name">New category</Label>
                <Input
                  id="new-category-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Burgers, Kebabs, Drinks"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newName.trim()) {
                      onAdd(newName.trim());
                      setNewName("");
                    }
                  }}
                />
              </div>
              <Button
                disabled={!newName.trim()}
                onClick={() => {
                  onAdd(newName.trim());
                  setNewName("");
                }}
              >
                <Plus data-icon="inline-start" />
                Add
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-medium">
                Archived categories{archivedCategories.length > 0 ? ` (${archivedCategories.length})` : ""}
              </p>
              {archivedCategories.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Archived categories wait here so you can restore them.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {archivedCategories.map((category) => (
                    <li
                      key={category.categoryId}
                      className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {category.name}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRestore(category.categoryId)}
                      >
                        <RotateCcw data-icon="inline-start" />
                        Restore
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
