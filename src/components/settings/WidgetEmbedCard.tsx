"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  tenantId: string;
}

export function WidgetEmbedCard({ tenantId }: Props) {
  const [publicWidgetId, setPublicWidgetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(
        `/api/settings/widget?tenantId=${encodeURIComponent(tenantId)}`
      );
      if (res.ok) {
        const payload = await res.json();
        setPublicWidgetId(payload.data?.publicWidgetId ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const widgetUrl = publicWidgetId ? `${origin}/widget?key=${publicWidgetId}` : "";
  const storeUrl = publicWidgetId ? `${origin}/store?key=${publicWidgetId}` : "";
  const loaderSnippet = publicWidgetId
    ? `<script
  async
  src="${origin}/widget-loader.js"
  data-widget-id="${publicWidgetId}"
  data-position="bottom-right"
  data-theme="light"
  data-mobile="fullscreen"
></script>`
    : "";
  const iframeSnippet = publicWidgetId
    ? `<iframe src="${widgetUrl}" style="border:0;position:fixed;bottom:16px;right:16px;width:380px;height:560px;max-width:100vw;max-height:80vh;z-index:9999;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.15)" title="Chat" allow="clipboard-write"></iframe>`
    : "";
  const storeSnippet = publicWidgetId
    ? `<a href="${storeUrl}" target="_blank" rel="noopener">Order online</a>`
    : "";

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 1800);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Widget &amp; Store</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading widget config...</p>
        ) : !publicWidgetId ? (
          <p className="text-sm text-muted-foreground">
            Widget config could not be loaded.
          </p>
        ) : (
          <>
            <Section
              label="Public widget key"
              value={publicWidgetId}
              onCopy={() => void copy(publicWidgetId, "key")}
              copied={copied === "key"}
            />
            <Section
              label="Store link (menu + orders)"
              value={storeUrl}
              onCopy={() => void copy(storeUrl, "store")}
              copied={copied === "store"}
              open
            />
            <Section
              label="Embed chat widget - recommended loader (paste before </body>)"
              value={loaderSnippet}
              onCopy={() => void copy(loaderSnippet, "loader")}
              copied={copied === "loader"}
              multiline
            />
            <Section
              label="Embed chat widget - plain iframe"
              value={iframeSnippet}
              onCopy={() => void copy(iframeSnippet, "chat")}
              copied={copied === "chat"}
              multiline
            />
            <Section
              label="Store link button snippet"
              value={storeSnippet}
              onCopy={() => void copy(storeSnippet, "btn")}
              copied={copied === "btn"}
              multiline
            />
            <p className="text-xs text-muted-foreground">
              The loader is asynchronous, isolates the widget from your site
              CSS, and works on static HTML, WordPress and Shopify. Only the
              public widget key is used - it exposes no keys and no private
              data.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  label,
  value,
  onCopy,
  copied,
  multiline,
  open,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  multiline?: boolean;
  open?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-start gap-2">
        <code
          className={`flex-1 overflow-x-auto rounded border border-border bg-muted px-2 py-1.5 text-xs ${
            multiline ? "whitespace-pre-wrap break-all" : "truncate"
          }`}
        >
          {value}
        </code>
        <div className="flex shrink-0 gap-1">
          {open && (
            <Button variant="outline" size="sm" asChild>
              <a href={value} target="_blank" rel="noreferrer noopener">
                Open
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onCopy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
