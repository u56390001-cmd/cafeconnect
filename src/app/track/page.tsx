"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CircleDot, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

interface TimelineStep {
  label: string;
  state: "done" | "current" | "upcoming" | "skipped";
}

interface TrackingData {
  orderNumber: string;
  status: string;
  fulfilmentType: "delivery" | "pickup";
  placedAt: string | null;
  totalLabel: string;
  itemCount: number;
  timeline: TimelineStep[];
  cancelled: boolean;
}

export default function TrackOrderPage() {
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("key") ?? "";
    const token = params.get("token") ?? "";
    if (!key || !token) {
      setError("This tracking link is not valid.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/orders/track?key=${encodeURIComponent(key)}&token=${encodeURIComponent(
          token
        )}`,
        { cache: "no-store" }
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          payload?.error?.message ??
            "We could not find that order. Please check the link or call the restaurant."
        );
        return;
      }
      setData(payload.data as TrackingData);
      setError("");
    } catch {
      setError("We could not load this order right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the status fresh while the order is still being prepared.
  useEffect(() => {
    if (!data || data.cancelled || data.status === "completed") return;
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [data, load]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Track your order</h1>
        {data ? (
          <p className="text-sm text-muted-foreground">
            Order #{data.orderNumber} · {data.itemCount} item
            {data.itemCount === 1 ? "" : "s"} · {data.totalLabel}
          </p>
        ) : null}
      </header>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Order not available</AlertTitle>
          <AlertDescription>
            {error} If the problem continues, please call the restaurant.
          </AlertDescription>
        </Alert>
      ) : data ? (
        <>
          <ol className="flex flex-col gap-0">
            {data.timeline.map((step, index) => (
              <li key={step.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex size-7 items-center justify-center rounded-full border ${
                      step.state === "done"
                        ? "border-success bg-success/10 text-success"
                        : step.state === "current"
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground"
                    }`}
                  >
                    {step.state === "done" ? (
                      <Check className="size-4" />
                    ) : step.state === "current" ? (
                      <CircleDot className="size-4" />
                    ) : step.state === "skipped" ? (
                      <X className="size-4" />
                    ) : (
                      <span className="size-2 rounded-full bg-current" />
                    )}
                  </span>
                  {index < data.timeline.length - 1 ? (
                    <span className="h-8 w-px bg-border" />
                  ) : null}
                </div>
                <p
                  className={`pb-8 text-sm ${
                    step.state === "upcoming" || step.state === "skipped"
                      ? "text-muted-foreground"
                      : "font-medium"
                  }`}
                >
                  {step.label}
                </p>
              </li>
            ))}
          </ol>

          {data.cancelled ? (
            <Alert>
              <AlertTitle>Order closed</AlertTitle>
              <AlertDescription>
                This order was cancelled. Please call the restaurant if you need
                help.
              </AlertDescription>
            </Alert>
          ) : null}

          <Button variant="outline" onClick={() => void load()}>
            Refresh status
          </Button>
        </>
      ) : null}
    </main>
  );
}
