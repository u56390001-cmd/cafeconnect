"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { createApiResponse, createApiError } from "@/lib/api/response";
import { encrypt } from "@/lib/security/encryption";

export default function SettingsPage() {
  const { user } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [geminiKey, setGeminiKey] = useState("");
  const [whatsappMode, setWhatsappMode] = useState<
    "meta" | "qr_trial"
  >("meta");
  const [status, setStatus] = useState<{
    gemini: "not_configured" | "pending_validation" | "connected" | "error";
    whatsapp:
      | "not_configured"
      | "pending_validation"
      | "connected"
      | "disconnected"
      | "error";
  }>({
    gemini: "not_configured",
    whatsapp: "not_configured",
  });
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
          setStatus((prev) => ({ ...prev, gemini: geminiKey.status as any }));
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

      const data = await res.json();
      setStatus((prev) => ({ ...prev, gemini: "pending_validation" }));
      setMessage({
        text: "Gemini API key saved successfully (encrypted)",
        type: "success",
      });
      setGeminiKey("");
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to save key",
        type: "error",
      });
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
        setStatus((prev) => ({ ...prev, whatsapp: "pending_validation" }));
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

  if (!tenantId) return <div className="p-4">Loading settings...</div>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tenant Settings</h1>
        <p className="text-gray-600">
          Manage API keys and channel integrations for tenant:{" "}
          <span className="font-mono text-sm">{tenantId}</span>
        </p>
      </div>

      {message && (
        <div
          className={`rounded-md p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-6 max-w-2xl">
        {/* Gemini AI Key Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Gemini AI Key</h2>
              <p className="text-sm text-gray-500">
                Server-side encryption. Key never exposed to browser.
              </p>
            </div>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              status.gemini === "connected"
                ? "bg-green-100 text-green-700"
                : status.gemini === "pending_validation"
                ? "bg-yellow-100 text-yellow-700"
                : status.gemini === "error"
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-500"
            }`}>
              {status.gemini.replace("_", " ")}
            </span>
          </div>

          <form onSubmit={handleSaveGeminiKey} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="w-full rounded-md border-gray-300 bg-gray-50 text-gray-900 focus:border-blue-500 focus:ring-blue-500"
                placeholder="AIza..."
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !geminiKey.trim()}
              className="w-full py-3 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Saving..." : "Save Encrypted Key"}
            </button>
            <p className="text-xs text-gray-500 mt-1">
              Key is encrypted with AES-256-GCM before storage.
            </p>
          </form>
        </div>

        {/* WhatsApp Mode Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                WhatsApp Connection
              </h2>
              <p className="text-sm text-gray-500">
                Choose your WhatsApp provider mode
              </p>
            </div>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              status.whatsapp === "connected"
                ? "bg-green-100 text-green-700"
                : status.whatsapp === "disconnected"
                ? "bg-red-100 text-red-700"
                : "bg-gray-100 text-gray-500"
            }`}>
              {status.whatsapp.replace("_", " ")}
            </span>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Provider Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleModeChange("meta")}
                className={`p-3 rounded-md border text-sm font-medium transition-colors ${
                  whatsappMode === "meta"
                    ? "bg-blue-50 border-blue-200 text-blue-700"
                    : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                📱 Meta Cloud API
              </button>
              <button
                onClick={() => handleModeChange("qr_trial")}
                className={`p-3 rounded-md border text-sm font-medium transition-colors ${
                  whatsappMode === "qr_trial"
                    ? "bg-blue-50 border-blue-200 text-blue-700"
                    : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                🔒 7-Day QR Trial
              </button>
            </div>

            {whatsappMode === "qr_trial" && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-sm text-yellow-800">
                  7-day trial expires server-side. Cannot be extended by
                  browser clock changes.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Security Info Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            Security Notes
          </h3>
          <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
            <li>All API keys are encrypted server-side before storage</li>
            <li>Full keys are never returned to the browser</li>
            <li>Only masked hints ({maskKey("sk-1234567890")}) are shown</li>
            <li>Firebase Admin SDK authorizes all server-side access</li>
            <li>Tenant ID is validated on every request</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
