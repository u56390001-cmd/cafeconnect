"use client";

import { useCallback, useEffect, useState } from "react";
import { Store } from "lucide-react";
import { authFetch } from "@/context/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface BusinessForm {
  businessName: string;
  businessType: string;
  phone: string;
  address: string;
  hours: string;
  currency: string;
  deliveryFeeRupees: string;
  minimumOrderRupees: string;
  deliveryArea: string;
  allowedAreaKeywords: string;
  pickupAvailable: boolean;
  paymentMethods: string;
  orderInstructions: string;
  greeting: string;
  tone: string;
  language: string;
  handoffNote: string;
}

const EMPTY: BusinessForm = {
  businessName: "",
  businessType: "cafe",
  phone: "",
  address: "",
  hours: "",
  currency: "PKR",
  deliveryFeeRupees: "0",
  minimumOrderRupees: "0",
  deliveryArea: "",
  allowedAreaKeywords: "",
  pickupAvailable: true,
  paymentMethods: "Cash on delivery",
  orderInstructions: "",
  greeting: "",
  tone: "",
  language: "en",
  handoffNote: "",
};

export function BusinessProfileCard({ tenantId }: { tenantId: string }) {
  const [form, setForm] = useState<BusinessForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(
        `/api/settings/business?tenantId=${encodeURIComponent(tenantId)}`
      );
      if (!res.ok) return;
      const payload = await res.json();
      const d = payload.data ?? {};
      setForm({
        businessName: d.businessName ?? "",
        businessType: d.businessType ?? "cafe",
        phone: d.phone ?? "",
        address: d.address ?? "",
        hours: d.hours ?? "",
        currency: d.currency ?? "PKR",
        deliveryFeeRupees: String(Math.round(Number(d.deliveryFeeMinor ?? 0) / 100)),
        minimumOrderRupees: String(Math.round(Number(d.minimumOrderMinor ?? 0) / 100)),
        deliveryArea: d.deliveryArea ?? "",
        allowedAreaKeywords: Array.isArray(d.allowedAreaKeywords)
          ? d.allowedAreaKeywords.join(", ")
          : "",
        pickupAvailable: d.pickupAvailable !== false,
        paymentMethods: d.paymentMethods ?? "",
        orderInstructions: d.orderInstructions ?? "",
        greeting: d.greeting ?? "",
        tone: d.tone ?? "",
        language: d.language ?? "en",
        handoffNote: d.handoffNote ?? "",
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await authFetch("/api/settings/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          ...form,
          deliveryFeeMinor: Math.round(Number(form.deliveryFeeRupees || 0) * 100),
          minimumOrderMinor: Math.round(Number(form.minimumOrderRupees || 0) * 100),
          allowedAreaKeywords: form.allowedAreaKeywords
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({
          text: payload?.error?.message ?? "Failed to save business profile",
          type: "error",
        });
        return;
      }
      setMessage({
        text: "Saved. The AI agent now uses this information when answering customers.",
        type: "success",
      });
    } catch {
      setMessage({ text: "Failed to save business profile", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof BusinessForm>(key: K, value: BusinessForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business &amp; AI profile</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <Store className="size-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Business &amp; AI Profile</CardTitle>
            <CardDescription className="text-sm">
              Everything here is given to the AI agent as grounded facts.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          {message && (
            <p
              className={`text-sm sm:col-span-2 ${
                message.type === "success" ? "text-success" : "text-destructive"
              }`}
            >
              {message.text}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="businessName">Business name</Label>
            <Input
              id="businessName"
              value={form.businessName}
              onChange={(e) => set("businessName", e.target.value)}
              placeholder="Brew & Bite Cafe"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="businessType">Business type</Label>
            <Select
              value={form.businessType}
              onValueChange={(v) => set("businessType", v)}
            >
              <SelectTrigger id="businessType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cafe">Cafe</SelectItem>
                <SelectItem value="restaurant">Restaurant</SelectItem>
                <SelectItem value="foodStall">Food Stall</SelectItem>
                <SelectItem value="bakery">Bakery</SelectItem>
                <SelectItem value="takeaway">Takeaway</SelectItem>
                <SelectItem value="cloudKitchen">Cloud Kitchen</SelectItem>
                <SelectItem value="homeChef">Home Chef</SelectItem>
                <SelectItem value="catering">Catering</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone / WhatsApp number</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+92 300 1234567"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hours">Opening hours</Label>
            <Input
              id="hours"
              value={form.hours}
              onChange={(e) => set("hours", e.target.value)}
              placeholder="Mon-Sun 9:00 AM - 11:00 PM"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Shop 4, Mall Road, Lahore"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deliveryFee">Delivery fee (PKR)</Label>
            <Input
              id="deliveryFee"
              type="number"
              min={0}
              step={1}
              value={form.deliveryFeeRupees}
              onChange={(e) => set("deliveryFeeRupees", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Charged on delivery orders. Enter whole rupees, e.g. 100 = PKR 100.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="minOrder">Minimum order (PKR)</Label>
            <Input
              id="minOrder"
              type="number"
              min={0}
              step={1}
              value={form.minimumOrderRupees}
              onChange={(e) => set("minimumOrderRupees", e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="deliveryArea">Delivery area</Label>
            <Input
              id="deliveryArea"
              value={form.deliveryArea}
              onChange={(e) => set("deliveryArea", e.target.value)}
              placeholder="Within 5 km of Mall Road"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="allowedAreaKeywords">
              Delivery area keywords (comma separated)
            </Label>
            <Input
              id="allowedAreaKeywords"
              value={form.allowedAreaKeywords}
              onChange={(e) => set("allowedAreaKeywords", e.target.value)}
              placeholder="faisal town, sargodha city, phase 2"
            />
            <p className="text-xs text-muted-foreground">
              The backend checks the customer address against these keywords and
              rejects out-of-area orders. If empty, orders are accepted but the
              assistant will not claim the address is deliverable.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="paymentMethods">Payment methods</Label>
            <Input
              id="paymentMethods"
              value={form.paymentMethods}
              onChange={(e) => set("paymentMethods", e.target.value)}
              placeholder="Cash on delivery, Card on pickup"
            />
          </div>

          <div className="flex items-center gap-2 sm:pt-6">
            <Switch
              id="pickup"
              checked={form.pickupAvailable}
              onCheckedChange={(v) => set("pickupAvailable", v)}
            />
            <Label htmlFor="pickup">Pickup available</Label>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="orderInstructions">Ordering instructions</Label>
            <Input
              id="orderInstructions"
              value={form.orderInstructions}
              onChange={(e) => set("orderInstructions", e.target.value)}
              placeholder="Orders confirmed within 10 minutes"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="greeting">Greeting used by the AI agent</Label>
            <Input
              id="greeting"
              value={form.greeting}
              onChange={(e) => set("greeting", e.target.value)}
              placeholder="Hi! Welcome to Brew & Bite. How can I help?"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tone">Tone</Label>
            <Input
              id="tone"
              value={form.tone}
              onChange={(e) => set("tone", e.target.value)}
              placeholder="Friendly and quick"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="language">Default language</Label>
            <select
              id="language"
              value={form.language}
              onChange={(e) => set("language", e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="en">English (Pakistani English)</option>
              <option value="ur-Latn-PK">Roman Urdu</option>
              <option value="ur-PK">Urdu (Urdu script)</option>
              <option value="mixed-PK">Mixed Urdu-English</option>
            </select>
            <p className="text-xs text-muted-foreground">
              The assistant still mirrors the customer&apos;s language; this is
              the fallback when the customer&apos;s language is unclear.
            </p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="handoffNote">Handoff message (when the agent is unsure)</Label>
            <Input
              id="handoffNote"
              value={form.handoffNote}
              onChange={(e) => set("handoffNote", e.target.value)}
              placeholder="Let me check with the kitchen and get back to you."
            />
          </div>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save business & AI profile"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


