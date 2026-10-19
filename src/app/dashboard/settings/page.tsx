"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const { user } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [geminiKey, setGeminiKey] = useState("");
  const [whatsappMode, setWhatsappMode] = useState<"meta" | "qr_trial">("meta");
  const [geminiStatus, setGeminiStatus] = useState<"not_configured" | "pending_validation" | "connected" | "error">("not_configured");
  const [whatsappStatus, setWhatsappStatus] = useState<"not_configured" | "pending_validation" | "connected" | "disconnected" | "error">("not_configured");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (user?.tenantId) {
      setTenantId(user.tenantId);
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/settings/ai-key?tenantId=${tenantId}&userId=${user?.uid}&role=owner`);
      if (res.ok) {
        const data = await res.json();
        const keys = data.keys || [];
        const geminiKey = keys.find((k: any) => k.provider === "gemini");
        if (geminiKey) {
          setGeminiStatus(geminiKey.status as any);
        }
      }
    } catch {
      // Silent fail
    }
  };

  const handleSaveGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !user) return;
    if (!geminiKey.trim()) {
      setMessage({ text: "API key is required", type: "error" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/ai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          userId: user.uid,
          role: user.role || "owner",
          provider: "gemini",
          keyValue: geminiKey,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to save key");
      }

      setGeminiStatus("pending_validation");
      setMessage({ text: "Gemini API key saved successfully (encrypted)", type: "success" });
      setGeminiKey("");
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Failed to save key", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = async (mode: "meta" | "qr_trial") => {
    if (!tenantId || !user) return;
    setWhatsappMode(mode);
    setLoading(true);

    try {
      const res = await fetch("/api/settings/ai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          userId: user.uid,
          role: user.role || "owner",
          provider: mode === "meta" ? "meta_whatsapp" : "qr_provider",
          keyValue: "",
        }),
      });

      if (res.ok) {
        setWhatsappStatus("pending_validation");
        setMessage({
          text: `WhatsApp ${mode === "meta" ? "Meta Cloud API" : "7-Day QR Trial"} configured`,
          type: "success",
        });
      }
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to update WhatsApp mode",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const maskKey = (key: string) => {
    if (!key || key.length < 8) return "••••••••";
    return `••••••${key.slice(-4)}`;
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case "connected": return "success";
      case "pending_validation": return "default";
      case "error":
      case "disconnected": return "destructive";
      default: return "secondary";
    }
  };

  if (!tenantId) return <div className="p-4">Loading settings...</div>;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tenant Settings</h1>
          <p className="text-muted-foreground">
            Manage API keys and channel integrations for tenant:{" "}
            <span className="font-mono text-sm">{tenantId}</span>
          </p>
        </div>
      </div>

      {message && (
        <Alert variant={message.type === "success" ? "success" : "destructive"}>
          <AlertTitle>
            {message.type === "success" ? "Success" : "Error"}
          </AlertTitle>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 max-w-2xl">
        {/* Gemini AI Key Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Gemini AI Key</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Server-side encryption. Key never exposed to browser.
                </CardDescription>
              </div>
              <Badge variant={statusVariant(geminiStatus)}>
                {geminiStatus.replace("_", " ")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <form onSubmit={handleSaveGeminiKey} className="space-y-4">
              <Field>
                <FieldLabel htmlFor="geminiKey">API Key</FieldLabel>
                <Input
                  id="geminiKey"
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIza..."
                  disabled={loading}
                />
              </Field>
              <Button type="submit" disabled={loading || !geminiKey.trim()} className="w-full">
                {loading ? "Saving..." : "Save Encrypted Key"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                Key is encrypted with AES-256-GCM before storage.
              </p>
            </form>
          </CardContent>
        </Card>

        {/* WhatsApp Mode Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">WhatsApp Connection</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Choose your WhatsApp provider mode
                </CardDescription>
              </div>
              <Badge variant={statusVariant(whatsappStatus)}>
                {whatsappStatus.replace("_", " ")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <Field>
              <FieldLabel>Provider Mode</FieldLabel>
              <ToggleGroup
                onValueChange={setWhatsappMode}
                defaultValue={whatsappMode}
              >
                <ToggleGroupItem value="meta">
                  📱 Meta Cloud API
                </ToggleGroupItem>
                <ToggleGroupItem value="qr_trial">
                  🔒 7-Day QR Trial
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>

            {whatsappMode === "qr_trial" && (
              <Alert variant="default">
                <AlertTitle>7-Day Trial</AlertTitle>
                <AlertDescription>
                  Trial expires server-side. Cannot be extended by browser
                  clock changes.
                </AlertDescription>
              </Alert>
            )}

            <Button onClick={() => handleModeChange(whatsappMode)} disabled={loading} className="w-full">
              {loading ? "Configuring..." : "Save WhatsApp Mode"}
            </Button>
          </CardContent>
        </Card>

        {/* Security Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Security Notes</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>All API keys are encrypted server-side before storage</li>
              <li>Full keys are never returned to the browser</li>
              <li>Only masked hints ({maskKey("sk-1234567890")}) are shown</li>
              <li>Firebase Admin SDK authorizes all server-side access</li>
              <li>Tenant ID is validated on every request</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
