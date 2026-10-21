"use client";

import { useCallback, useEffect, useState } from "react";
import { QrCode, RefreshCw, ShieldAlert, Square } from "lucide-react";
import { authFetch } from "@/context/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

interface QrTrialState {
  status:
    | "not_configured"
    | "pending_scan"
    | "connected"
    | "disconnected"
    | "expired"
    | "error";
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  linkedPhone: string | null;
  messagesUsed: number;
  messageQuota: number;
  lastHealthCheckAt: string | null;
}

interface QrTrialResponse {
  success: boolean;
  data: {
    providerConfigured: boolean;
    state: QrTrialState;
    webhookUrl: string | null;
  };
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  not_configured: "outline",
  pending_scan: "secondary",
  connected: "default",
  disconnected: "outline",
  expired: "destructive",
  error: "destructive",
};

export function QrTrialCard({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<QrTrialState | null>(null);
  const [providerConfigured, setProviderConfigured] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(
        `/api/settings/whatsapp/qr?tenantId=${encodeURIComponent(tenantId)}`
      );
      if (!res.ok) {
        setError("Failed to load QR trial state");
        return;
      }
      const payload = (await res.json()) as QrTrialResponse;
      setState(payload.data.state);
      setProviderConfigured(payload.data.providerConfigured);
      setWebhookUrl(payload.data.webhookUrl);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: "start" | "refresh" | "stop") {
    setBusy(true);
    setError("");
    try {
      const res = await authFetch("/api/settings/whatsapp/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, action }),
      });
      const payload = (await res.json().catch(() => null)) as
        | (QrTrialResponse & { error?: { message?: string } })
        | null;
      if (!res.ok) {
        setError(payload?.error?.message ?? "Request failed");
        return;
      }
      if (payload?.data?.state) setState(payload.data.state);
    } finally {
      setBusy(false);
    }
  }

  const daysLeft =
    state?.trialEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(state.trialEndsAt).getTime() - Date.now()) / 86400000
          )
        )
      : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            >
              <QrCode className="size-5" />
            </div>
            <div>
              <CardTitle className="text-lg">WhatsApp QR Trial</CardTitle>
              <CardDescription className="text-sm">
                Link your number by scanning the provider QR code. The AI agent
                then answers customers on WhatsApp.
              </CardDescription>
            </div>
          </div>
          {state && (
            <Badge variant={STATUS_VARIANT[state.status] ?? "outline"}>
              {state.status.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : !providerConfigured ? (
          <Alert>
            <ShieldAlert className="size-4" />
            <AlertTitle>Provider not configured</AlertTitle>
            <AlertDescription>
              This deployment has no QR WhatsApp provider credentials configured
              yet. Add QR_PROVIDER_BASE_URL and QR_PROVIDER_API_KEY to the
              server environment to enable it.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {state?.status === "pending_scan" && (
              <Alert>
                <QrCode className="size-4" />
                <AlertTitle>Scan required</AlertTitle>
                <AlertDescription>
                  Open the provider dashboard, generate the QR code, and scan it
                  with WhatsApp on your phone. Then press Refresh status.
                </AlertDescription>
              </Alert>
            )}

            {state?.status === "expired" && (
              <Alert variant="destructive">
                <AlertTitle>Trial expired</AlertTitle>
                <AlertDescription>
                  The 7-day trial has ended. Switch to the official Meta Cloud
                  API to keep serving customers on WhatsApp.
                </AlertDescription>
              </Alert>
            )}

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Linked number</dt>
                <dd className="font-medium">
                  {state?.linkedPhone ?? "Not linked"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Trial days left</dt>
                <dd className="font-medium">
                  {state?.trialEndsAt ? `${daysLeft} of 7` : "Not started"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Messages used</dt>
                <dd className="font-medium">
                  {state?.messagesUsed ?? 0} / {state?.messageQuota ?? 500}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last health check</dt>
                <dd className="font-medium">
                  {state?.lastHealthCheckAt
                    ? new Date(state.lastHealthCheckAt).toLocaleString()
                    : "—"}
                </dd>
              </div>
            </dl>

            {webhookUrl && (
              <div className="rounded-md border border-border bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Inbound webhook (registered automatically on start)
                </p>
                <code className="break-all text-xs">{webhookUrl}</code>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void act("start")} disabled={busy}>
                {state?.trialStartedAt ? "Restart trial" : "Start 7-day trial"}
              </Button>
              <Button
                variant="outline"
                onClick={() => void act("refresh")}
                disabled={busy}
              >
                <RefreshCw data-icon="inline-start" />
                Refresh status
              </Button>
              <Button
                variant="ghost"
                onClick={() => void act("stop")}
                disabled={busy || !state?.trialStartedAt}
              >
                <Square data-icon="inline-start" />
                Disconnect
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
