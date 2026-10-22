"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PHONE_HINT } from "@/lib/domain/phone";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface CustomerDetails {
  customerName: string;
  customerPhone: string;
  fulfilmentType: "delivery" | "pickup";
  address: string;
  notes: string;
}

interface CustomerSheetProps {
  open: boolean;
  details: CustomerDetails;
  paymentMode: boolean;
  submitLabel: string;
  error: string | null;
  onConfirm: (details: CustomerDetails) => void;
  onClose: () => void;
}

/**
 * Customer details of the counter order. Kept in one sheet so staff fill the
 * same data the online checkout asks for, and the order API stays the single
 * place that validates the delivery address.
 */
export function CustomerSheet({
  open,
  details,
  paymentMode,
  submitLabel,
  error,
  onConfirm,
  onClose,
}: CustomerSheetProps) {
  const [form, setForm] = useState<CustomerDetails>(details);

  useEffect(() => {
    if (open) setForm(details);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{paymentMode ? "Payment & details" : "Who is this order for?"}</SheetTitle>
          <SheetDescription>
            {paymentMode
              ? "Confirm how the customer paid, then record the bill."
              : "The order must give a phone number; delivery also needs an address."}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex-1 space-y-3 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm(form);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="pos-customer-name">Name</Label>
            <Input
              id="pos-customer-name"
              value={form.customerName}
              onChange={(event) =>
                setForm({ ...form, customerName: event.target.value })
              }
              required
              maxLength={100}
              placeholder="Walk-in or e.g. Ali"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pos-customer-phone">Phone</Label>
            <Input
              id="pos-customer-phone"
              type="tel"
              value={form.customerPhone}
              onChange={(event) => setForm({ ...form, customerPhone: event.target.value })}
              required
              maxLength={20}
              autoComplete="tel"
              inputMode="tel"
            />
            <p className="text-xs text-muted-foreground">{PHONE_HINT}</p>
          </div>
          {form.fulfilmentType === "delivery" && (
            <div className="space-y-1">
              <Label htmlFor="pos-customer-address">Delivery address</Label>
              <Textarea
                id="pos-customer-address"
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                required
                rows={3}
                maxLength={300}
                placeholder="House, street, area"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="pos-customer-notes">Order note (optional)</Label>
            <Input
              id="pos-customer-notes"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              maxLength={300}
              placeholder="e.g. ring bell twice / less spicy"
            />
          </div>
          {error && (
            <p className="text-xs font-medium text-red-600" role="alert">
              {error}
            </p>
          )}
          <SheetFooter className="gap-2 px-0 pb-0">
            <Button type="submit" className="bg-orange-600 hover:bg-orange-700">
              {submitLabel}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
