"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Empty } from "@/components/ui/empty";

interface Offer {
  offerId: string;
  name: string;
  description: string;
  type: string;
  valuePct: number | null;
  valueMinor: number | null;
  minOrderMinor: number | null;
  status: string;
  startAt: string | null;
  endAt: string | null;
}

const typeLabel: Record<string, string> = {
  percentage: "Percentage off",
  fixedDiscount: "Fixed amount off",
  freeDelivery: "Free delivery",
};

function valueSummary(offer: Offer): string {
  if (offer.type === "percentage" && offer.valuePct) return `${offer.valuePct}%`;
  if (offer.type === "fixedDiscount" && offer.valueMinor)
    return `PKR ${Math.round(offer.valueMinor / 100)}`;
  if (offer.type === "freeDelivery") return "Delivery fee waived";
  return "Special";
}

function statusBadge(offer: Offer) {
  const active =
    offer.status === "active" &&
    (!offer.endAt || new Date(offer.endAt) > new Date());
  if (active) {
    return (
      <Badge className="bg-success/10 text-success border-success/30" variant="secondary">
        Active
      </Badge>
    );
  }
  if (offer.status === "paused") {
    return (
      <Badge variant="secondary" className="bg-warning/10 text-warning border-warning/30">
        Paused
      </Badge>
    );
  }
  return <Badge variant="outline">{offer.status === "active" ? "Expired" : offer.status}</Badge>;
}

function OffersPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "percentage",
    value: "10",
    minOrder: "",
    description: "",
    status: "draft",
    endAt: "",
  });

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/offers?tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setOffers(data.data?.offers ?? []);
      }
    } catch {
      setError("Failed to load offers");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        tenantId,
        name: form.name,
        type: form.type,
        value: form.type === "percentage" ? Number(form.value) : Math.round(Number(form.value) * 100),
        minOrder: form.minOrder ? Math.round(Number(form.minOrder) * 100) : undefined,
        description: form.description,
        status: form.status,
        endAt: form.endAt || undefined,
      };
      const res = await authFetch("/api/offers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setError(err?.error?.message ?? "Failed to save offer");
      } else {
        setForm({ name: "", type: "percentage", value: "10", minOrder: "", description: "", status: "draft", endAt: "" });
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(offerId: string, status: string) {
    if (!tenantId) return;
    const res = await authFetch("/api/offers", {
      method: "PATCH",
      body: JSON.stringify({ tenantId, offerId, status }),
    });
    if (res.ok) await load();
  }

  async function remove(offerId: string) {
    if (!tenantId) return;
    const res = await authFetch(
      `/api/offers?tenantId=${tenantId}&offerId=${offerId}`,
      { method: "DELETE" }
    );
    if (res.ok) await load();
  }

  if (!tenantId) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Deals &amp; Offers</h1>
        <p className="text-sm text-muted-foreground">
          Active offers are shown to customers by your AI assistant and applied at checkout.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Offer</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="offerName">Offer name</Label>
              <Input
                id="offerName"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Ramadan Special"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="offerType">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger id="offerType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage off</SelectItem>
                  <SelectItem value="fixedDiscount">Fixed amount off</SelectItem>
                  <SelectItem value="freeDelivery">Free delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.type !== "freeDelivery" && (
              <div className="space-y-2">
                <Label htmlFor="offerValue">
                  {form.type === "percentage" ? "Discount %" : "Discount amount (PKR)"}
                </Label>
                <Input
                  id="offerValue"
                  type="number"
                  min={form.type === "percentage" ? 1 : 1}
                  max={form.type === "percentage" ? 90 : undefined}
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="offerMin">Minimum order (PKR, optional)</Label>
              <Input
                id="offerMin"
                type="number"
                min="0"
                value={form.minOrder}
                onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
                placeholder="e.g. 500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="offerEnd">End date (optional)</Label>
              <Input
                id="offerEnd"
                type="date"
                value={form.endAt}
                onChange={(e) => setForm({ ...form, endAt: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="offerStatus">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger id="offerStatus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active (go live)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="offerDescription">Description (optional)</Label>
              <Textarea
                id="offerDescription"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Shown to customers, e.g. All week on dine-in orders"
                rows={2}
              />
            </div>
            {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Create Offer"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Offers ({offers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading offers...</p>
          ) : offers.length === 0 ? (
            <Empty>
              <p>No offers yet. Create one above.</p>
            </Empty>
          ) : (
            <ul className="divide-y">
              {offers.map((offer) => (
                <li key={offer.offerId} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{offer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {typeLabel[offer.type] ?? offer.type} · {valueSummary(offer)}
                      {offer.minOrderMinor ? ` · min PKR ${Math.round(offer.minOrderMinor / 100)}` : ""}
                      {offer.endAt ? ` · ends ${new Date(offer.endAt).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  {statusBadge(offer)}
                  {offer.status === "active" ? (
                    <Button size="sm" variant="outline" onClick={() => setStatus(offer.offerId, "paused")}>
                      Pause
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setStatus(offer.offerId, "active")}>
                      Activate
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(offer.offerId)}>
                    Delete
                  </Button>
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
  return <OffersPage />;
}
