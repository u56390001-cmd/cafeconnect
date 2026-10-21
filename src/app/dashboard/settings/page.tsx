"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth, authFetch } from "@/context/AuthContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApiKeyCard, SecurityNotice, type KeyStatus } from "@/components/settings/ApiKeyCard";
import {
  WhatsappModeCard,
  type WhatsappMode,
  type WhatsappStatus,
} from "@/components/settings/WhatsappModeCard";
import { WidgetEmbedCard } from "@/components/settings/WidgetEmbedCard";
import { QrTrialCard } from "@/components/settings/QrTrialCard";
import { BusinessProfileCard } from "@/components/settings/BusinessProfileCard";

interface ApiKeySummary {
  keyId: string;
  provider: "gemini" | "meta_whatsapp" | "qr_provider";
  maskedHint: string;
  status: string;
  keyVersion: number;
  lastValidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiKeyListResponse {
  success: boolean;
  data: { keys: ApiKeySummary[] };
}

interface WhatsappSettingsResponse {
  success: boolean;
  data: {
    mode: WhatsappMode | null;
    provider: string | null;
    status: WhatsappStatus;
  };
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<KeyStatus>("not_configured");
  const [whatsappStatus, setWhatsappStatus] =
    useState<WhatsappStatus>("not_configured");
  const [whatsappMode, setWhatsappMode] = useState<WhatsappMode>("meta");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    if (user?.tenantId) {
      setTenantId(user.tenantId);
    }
  }, [user]);

  const loadSettings = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [keysRes, waRes] = await Promise.all([
        authFetch(`/api/settings/ai-key?tenantId=${tenantId}`),
        authFetch(`/api/settings/whatsapp?tenantId=${tenantId}`),
      ]);

      if (keysRes.ok) {
        const payload = (await keysRes.json()) as ApiKeyListResponse;
        const keys = payload.data?.keys ?? [];
        const gemini = keys.find((k) => k.provider === "gemini");
        if (gemini) {
          setGeminiStatus(
            gemini.status === "active" ? "connected" : "pending_validation"
          );
        }
      }

      if (waRes.ok) {
        const payload = (await waRes.json()) as WhatsappSettingsResponse;
        if (payload.data?.mode) {
          setWhatsappMode(payload.data.mode);
        }
        setWhatsappStatus(payload.data?.status ?? "not_configured");
      }
    } catch {
      setGeminiStatus("error");
    }
  }, [tenantId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveKey = async (provider: string, keyValue: string) => {
    if (!tenantId || !user) return;
    setLoading(true);
    setMessage(null);

    try {
      const res = await authFetch("/api/settings/ai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          provider,
          keyValue,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to save key");
      }

      if (provider === "gemini") {
        setGeminiStatus("pending_validation");
      }
      setMessage({
        text: "Key saved. It is encrypted at rest and never returned to the browser.",
        type: "success",
      });
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to save key",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveWhatsappMode = async () => {
    if (!tenantId || !user) return;
    setLoading(true);
    setMessage(null);

    try {
      const res = await authFetch("/api/settings/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          mode: whatsappMode,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to update WhatsApp mode");
      }

      const payload = (await res.json()) as WhatsappSettingsResponse;
      setWhatsappStatus(payload.data?.status ?? "pending_validation");
      setMessage({
        text: `WhatsApp mode set to ${
          whatsappMode === "meta" ? "Meta Cloud API" : "7-Day QR Trial"
        }.`,
        type: "success",
      });
    } catch (err: unknown) {
      setMessage({
        text:
          err instanceof Error ? err.message : "Failed to update WhatsApp mode",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!tenantId) {
    return <div className="p-6 text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Tenant Settings</h1>
        <p className="text-muted-foreground">
          Manage API keys and channel integrations for tenant{" "}
          <span className="font-mono text-sm">{tenantId}</span>
        </p>
      </header>

      {message && (
        <div className="mb-6 max-w-2xl">
          <Alert variant={message.type === "success" ? "success" : "destructive"}>
            <AlertTitle>
              {message.type === "success" ? "Success" : "Error"}
            </AlertTitle>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        </div>
      )}

      <div className="flex max-w-2xl flex-col gap-6">
        <BusinessProfileCard tenantId={tenantId} />

        <ApiKeyCard
          title="Gemini AI Key"
          description="Used by the shared AI engine for both chat channels."
          provider="gemini"
          status={geminiStatus}
          placeholder="AIza..."
          loading={loading}
          footnote="Encrypted with AES-256-GCM before storage. The key is never sent back to the browser."
          onSave={(value) => saveKey("gemini", value)}
        />

        <WhatsappModeCard
          mode={whatsappMode}
          status={whatsappStatus}
          loading={loading}
          onModeChange={setWhatsappMode}
          onSave={saveWhatsappMode}
        />

        {whatsappMode === "qr_trial" ? (
          <QrTrialCard tenantId={tenantId} />
        ) : (
          <ApiKeyCard
            title="WhatsApp Credential"
            description="Meta WhatsApp Cloud API access token for this tenant."
            provider="meta_whatsapp"
            status={
              whatsappStatus === "connected"
                ? "connected"
                : whatsappStatus === "not_configured"
                ? "not_configured"
                : "pending_validation"
            }
            placeholder="EAAG..."
            loading={loading}
            footnote="Tenant-owned credential. Platform-owned trial credentials are never exposed here."
            onSave={(value) => saveKey("meta_whatsapp", value)}
          />
        )}

        <WidgetEmbedCard tenantId={tenantId} />

        <SecurityNotice />
      </div>
    </div>
  );
}
