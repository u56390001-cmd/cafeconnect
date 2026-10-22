"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { optionText, type PosDraftSummary } from "@/lib/pos/types";

interface DraftListSheetProps {
  open: boolean;
  drafts: PosDraftSummary[];
  loading: boolean;
  onLoad: (draft: PosDraftSummary) => void;
  onDelete: (draftId: string) => void;
  onClose: () => void;
}

/** Saved counter orders that were not sent yet (Work done → continue → send). */
export function DraftListSheet({
  open,
  drafts,
  loading,
  onLoad,
  onDelete,
  onClose,
}: DraftListSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Drafts</SheetTitle>
          <SheetDescription>
            Orders started at the counter and not sent to the kitchen yet.
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <p className="px-1 py-4 text-sm text-muted-foreground">Loading drafts…</p>
        )}

        {!loading && drafts.length === 0 && (
          <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No drafts right now. Start an order and tap Draft to keep it for later.
          </div>
        )}

        <ul className="space-y-2 px-1">
          {!loading &&
            drafts.map((draft) => (
              <li key={draft.draftId} className="rounded-lg border bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {draft.customer?.name ?? "Walk-in"}
                      {draft.customer?.phone ? (
                        <span className="text-muted-foreground"> · {draft.customer.phone}</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {draft.items
                        .map(
                          (item) =>
                            `${item.quantity}× ${item.name}${
                              item.note ? ` (${item.note})` : ""
                            }${item.options?.length ? ` · ${optionText(item.options)}` : ""}`
                        )
                        .join(", ") || "Empty draft"}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {draft.fulfilment?.type === "pickup" ? "Pickup" : "Delivery"}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(draft.updatedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="secondary">{draft.items.length} items</Badge>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => onLoad(draft)}
                      >
                        Load
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => onDelete(draft.draftId)}
                        aria-label={`Delete draft of ${draft.items.length} items`}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Prices are recalculated by the pricing engine when the draft is
                  sent — a draft stores items, not a bill.
                </p>
              </li>
            ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
