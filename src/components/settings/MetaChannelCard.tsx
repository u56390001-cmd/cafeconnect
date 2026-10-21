"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, CloudCog, Copy, RefreshCw } from "lucide-react";
import { authFetch } from "@/context/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

interface MetaState {
  connection: "not_configured" | "connected" | "error";
  connectionDetail: string | null;
  hasTenantToken: boolean;
  usingPlatformToken: boolean;
  phoneNumberId: string | null;
  verifyTokenConfigured: boolean;
  appSecretConfigured: boolean;
  webhookUrl: string | null;
  graphVersion: string;
}

export function MetaChannelCard({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<MetaState | null>(null);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(
        `/api/settings/whatsapp/meta?tenantId=${encodeURIComponent(tenantId)}`
      );
      if (!res.ok) {
        setMessage({ text: "Failed to load Meta channel status", type: "error" });
        return;
      }
      const payload = await res.json();
      const data = payload.data as MetaState;
      setState(data);
      setPhoneNumberId((prev) => prev || data.phoneNumberId || "");
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
      const res = await authFetch("/api/settings/whatsapp/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, phoneNumberId: phoneNumberId.trim() }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({
          text: payload?.error?.message ?? "Failed to save phone number id",
          type: "error",
        });
        return;
      }
      setMessage({
        text: "Phone number id saved and mapped to this business.",
        type: "success",
      });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function copyWebhook() {
    if (!state?.webhookUrl) return;
    await navigator.clipboard.writeText(state.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meta Cloud API</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const connected = state?.connection === "connected";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            >
              <CloudCog className="size-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Meta Cloud API (official)</CardTitle>
              <CardDescription className="text-sm">
                Connect your own WhatsApp Business number. This is the official,
                policy-compliant channel for production.
              </CardDescription>
            </div>
          </div>
          <Badge variant={connected ? "default" : "outline"}>
            {connected ? "connected" : (state?.connection ?? "not_configured")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <Alert variant={message.type === "success" ? "success" : "destructive"}>
            <AlertTitle>{message.type === "success" ? "Success" : "Error"}</AlertTitle>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {state?.connectionDetail && (
          <p className="text-sm text-muted-foreground">{state.connectionDetail}</p>
        )}

        {!state?.hasTenantToken && !state?.usingPlatformToken && (
          <Alert>
            <AlertTitle>Access token missing</AlertTitle>
            <AlertDescription>
              Save your Meta WhatsApp access token in the &quot;WhatsApp
              Credential&quot; card above. It is encrypted at rest and never
              returned to the browser.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={save} className="space-y-2">
          <Label htmlFor="metaPhoneNumberId">Phone Number ID</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="metaPhoneNumberId"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="123456789012345"
              className="max-w-xs"
            />
            <Button type="submit" variant="outline" disabled={saving || !phoneNumberId.trim()}>
              {saving ? "Saving..." : "Save & map"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => void load()}>
              <RefreshCw data-icon="inline-start" />
              Refresh
            </Button>
          </div>
        </form>

        {state?.webhookUrl && (
          <div className="rounded-md border border-border bg-muted px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Paste this callback URL in the Meta app dashboard (Webhooks field)
            </p>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 break-all text-xs">{state.webhookUrl}</code>
              <Button variant="ghost" size="sm" onClick={() => void copyWebhook()}>
                <Copy data-icon="inline-start" />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}

        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-center gap-2">
            <BadgeCheck className="size-3.5" aria-hidden="true" />
            Verify token configured: {state?.verifyTokenConfigured ? "yes" : "no"}
          </li>
          <li className="flex items-center gap-2">
            <BadgeCheck className="size-3.5" aria-hidden="true" />
            App secret configured: {state?.appSecretConfigured ? "yes" : "no"}
          </li>
          <li className="flex items-center gap-2">
            <BadgeCheck className="size-3.5" aria-hidden="true" />
            Graph API version: {state?.graphVersion}
          </li>
        </ul>

        <p className="text-xs text-muted-foreground">
          Meta requires an approved message template for outbound messages
          outside the 24-hour customer service window.
        </p>
      </CardContent>
    </Card>
  );
}
