"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { CalendarDays } from "lucide-react";
import { NoTenantNotice } from "@/components/dashboard/NoTenantNotice";
import { PageHeader } from "@/components/dashboard/page-header";
import { Skeleton } from "@/components/ui/skeleton";

interface Booking {
  bookingId: string;
  customerName: string;
  phone: string;
  date: string;
  time: string;
  partySize: number | null;
  notes: string;
  status: string;
}

const statusBadge: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/30",
  confirmed: "bg-success/10 text-success border-success/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
  completed: "bg-muted text-muted-foreground",
};

function BookingsPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    date: "",
    time: "",
    partySize: "2",
    notes: "",
  });

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/bookings?tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setBookings(data.data?.bookings ?? []);
      }
    } catch {
      setError("Failed to load bookings");
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
      const res = await authFetch("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          tenantId,
          ...form,
          partySize: parseInt(form.partySize, 10),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setError(err?.error?.message ?? "Failed to create booking");
      } else {
        setForm({ customerName: "", phone: "", date: "", time: "", partySize: "2", notes: "" });
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(bookingId: string, status: string) {
    if (!tenantId) return;
    setError("");
    try {
      const res = await authFetch("/api/bookings", {
        method: "PATCH",
        body: JSON.stringify({ tenantId, bookingId, status }),
      });
      if (res.ok) {
        setBookings((bs) => bs.map((b) => (b.bookingId === bookingId ? { ...b, status } : b)));
      } else {
        const payload = await res.json().catch(() => null);
        setError(payload?.error?.message ?? "That change could not be saved. Please try again.");
      }
    } catch {
      setError("That change could not be saved. Please try again.");
    }
  }

  if (!tenantId) return <NoTenantNotice />

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarDays}
        title="Bookings"
        description="Table bookings. New bookings start as pending until you confirm."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Booking</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="bookName">Customer name</Label>
              <Input
                id="bookName"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bookPhone">Phone</Label>
              <Input
                id="bookPhone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="03xx-xxxxxxx"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bookSize">Party size</Label>
              <Input
                id="bookSize"
                type="number"
                min="1"
                max="50"
                value={form.partySize}
                onChange={(e) => setForm({ ...form, partySize: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bookDate">Date</Label>
              <Input
                id="bookDate"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bookTime">Time</Label>
              <Input
                id="bookTime"
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bookNotes">Notes (optional)</Label>
              <Input
                id="bookNotes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. window seat"
              />
            </div>
            {error && <p className="text-sm text-destructive sm:col-span-3">{error}</p>}
            <div className="sm:col-span-3">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Create Booking"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bookings ({bookings.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <ul className="flex flex-col divide-y" aria-hidden="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <li key={index} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </li>
              ))}
            </ul>
          ) : bookings.length === 0 ? (
            <Empty>
              <p>No bookings yet.</p>
            </Empty>
          ) : (
            <ul className="divide-y">
              {bookings.map((b) => (
                <li key={b.bookingId} className="flex flex-wrap items-center gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {b.customerName}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({b.partySize ?? "?"} people)
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.date} at {b.time} Â· {b.phone}
                      {b.notes ? ` Â· ${b.notes}` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary" className={statusBadge[b.status]}>
                    {b.status}
                  </Badge>
                  {b.status === "pending" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setStatus(b.bookingId, "confirmed")}>
                        Confirm
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(b.bookingId, "cancelled")}>
                        Cancel
                      </Button>
                    </>
                  )}
                  {b.status === "confirmed" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(b.bookingId, "completed")}>
                      Complete
                    </Button>
                  )}
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
  return <BookingsPage />;
}


