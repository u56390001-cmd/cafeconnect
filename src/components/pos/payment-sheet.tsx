"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatMoney } from "@/lib/domain/money";

interface PaymentSheetProps {
  open: boolean;
  methods: string[];
  totalLabel: string;
  error: string | null;
  submitting: boolean;
  onConfirm: (method: string) => void;
  onClose: () => void;
}

/**
 * Records how the customer paid, like handing over cash at a counter. The
 * sheet only suggests the methods the restaurant saved; the server still
 * decides whether the signed-in staff member may store the payment.
 */
export function PaymentSheet({
  open,
  methods,
  totalLabel,
  error,
  submitting,
  onConfirm,
  onClose,
}: PaymentSheetProps) {
  const [method, setMethod] = useState<string>(methods[0] ?? "Cash");

  useEffect(() => {
    if (open) setMethod(methods[0] ?? "Cash");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, methods]);

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent side="bottom" className="sm:max-w-sm sm:rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Payment received?</SheetTitle>
          <SheetDescription>
            Total <span className="font-semibold text-foreground">{totalLabel}</span>. Choose
            the payment method.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Payment method">
          {(methods.length > 0 ? methods : ["Cash", "Card", "Online transfer"]).map(
            (option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={method === option}
                onClick={() => setMethod(option)}
                className={cn(
                  "min-w-20 rounded-full border px-4 py-2 text-sm transition-colors",
                  method === option
                    ? "border-transparent bg-orange-600 text-white"
                    : "bg-white text-foreground hover:bg-muted"
                )}
              >
                {option}
              </button>
            )
          )}
        </div>

        {error && (
          <p className="mt-2 text-xs font-medium text-red-600" role="alert">
            {error}
          </p>
        )}

        <SheetFooter className="mt-3 gap-2">
          <Button
            onClick={() => onConfirm(method)}
            disabled={submitting}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {submitting ? "Recording…" : `Confirm — ${totalLabel}`}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
