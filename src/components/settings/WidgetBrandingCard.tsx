"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { authFetch } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { contrastRatio } from "@/lib/widget/theme";

interface Branding {
  primaryColor: string;
  accentColor: string;
  themeMode: "light" | "dark" | "auto";
  radius: "soft" | "sharp" | "round";
  density: "compact" | "comfortable";
  fontPreset: "system" | "serif" | "rounded";
  logoUrl: string;
  launcherPosition: "bottom-right" | "bottom-left";
  launcherLabel: string;
  greeting: string;
  starterPrompts: string[];
  showImages: boolean;
  showProducts: boolean;
  showCart: boolean;
  showStorefrontLink: boolean;
}

const DEFAULTS: Branding = {
  primaryColor: "#ea580c",
  accentColor: "#f59e0b",
  themeMode: "light",
  radius: "soft",
  density: "comfortable",
  fontPreset: "system",
  logoUrl: "",
  launcherPosition: "bottom-right",
  launcherLabel: "Order with us",
  greeting: "",
  starterPrompts: [
    "Menu dikhao",
    "2 logon ke liye kuch suggest karo",
    "Delivery charges kitne hain?",
  ],
  showImages: true,
  showProducts: true,
  showCart: true,
  showStorefrontLink: true,
};

export function WidgetBrandingCard({ tenantId }: { tenantId: string }) {
  const [publicWidgetId, setPublicWidgetId] = useState<string | null>(null);
  const [branding, setBranding] = useState<Branding>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState("");
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(
        `/api/settings/widget?tenantId=${encodeURIComponent(tenantId)}`
      );
      if (!res.ok) return;
      const payload = await res.json();
      setPublicWidgetId(payload.data?.publicWidgetId ?? null);
      if (payload.data?.branding) {
        setBranding({ ...DEFAULTS, ...payload.data.branding });
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await authFetch("/api/settings/widget", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, branding }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({
          text: payload?.error?.message ?? "The widget settings could not be saved.",
          type: "error",
        });
        return;
      }
      setMessage({ text: "Widget appearance updated.", type: "success" });
    } catch {
      setMessage({ text: "The widget settings could not be saved.", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [tenantId, branding]);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-domain";
  const loaderUrl = `${origin}/widget-loader.js`;
  const storeUrl = publicWidgetId ? `${origin}/store?key=${publicWidgetId}` : "";
  const widgetUrl = publicWidgetId
    ? `${origin}/widget?key=${publicWidgetId}`
    : "";

  const embedSnippet = publicWidgetId
    ? `<script
  async
  src="${loaderUrl}"
  data-widget-id="${publicWidgetId}"
  data-position="${branding.launcherPosition}"
  data-theme="${branding.themeMode}"
  data-mobile="fullscreen"
></script>`
    : "";

  const contrast = useMemo(() => {
    try {
      return contrastRatio(branding.primaryColor, "#ffffff");
    } catch {
      return 21;
    }
  }, [branding.primaryColor]);

  const lowContrast = contrast < 3;

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 1800);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Chat widget</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void save()}
            disabled={saving || loading}
          >
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {message ? (
          <Alert variant={message.type === "success" ? "success" : "destructive"}>
            <AlertTitle>
              {message.type === "success" ? "Saved" : "Could not save"}
            </AlertTitle>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading widget config...</p>
        ) : !publicWidgetId ? (
          <p className="text-sm text-muted-foreground">
            Widget config could not be loaded.
          </p>
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <p className="text-sm font-medium">Brand colour</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="widget-primary" className="text-xs">
                    Primary
                  </Label>
                  <Input
                    id="widget-primary"
                    value={branding.primaryColor}
                    onChange={(e) =>
                      setBranding({ ...branding, primaryColor: e.target.value })
                    }
                    placeholder="#ea580c"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="widget-accent" className="text-xs">
                    Accent
                  </Label>
                  <Input
                    id="widget-accent"
                    value={branding.accentColor}
                    onChange={(e) =>
                      setBranding({ ...branding, accentColor: e.target.value })
                    }
                    placeholder="#f59e0b"
                  />
                </div>
              </div>
              {lowContrast ? (
                <p className="text-xs text-amber-700">
                  This colour is hard to read on white. Pick a darker shade so
                  the chat header stays legible.
                </p>
              ) : null}
            </section>

            <Separator />

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="widget-theme" className="text-xs">
                  Theme
                </Label>
                <select
                  id="widget-theme"
                  value={branding.themeMode}
                  onChange={(e) =>
                    setBranding({
                      ...branding,
                      themeMode: e.target.value as Branding["themeMode"],
                    })
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="auto">Match the visitor device</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="widget-radius" className="text-xs">
                  Corner style
                </Label>
                <select
                  id="widget-radius"
                  value={branding.radius}
                  onChange={(e) =>
                    setBranding({
                      ...branding,
                      radius: e.target.value as Branding["radius"],
                    })
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="soft">Soft</option>
                  <option value="sharp">Sharp</option>
                  <option value="round">Round</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="widget-font" className="text-xs">
                  Font
                </Label>
                <select
                  id="widget-font"
                  value={branding.fontPreset}
                  onChange={(e) =>
                    setBranding({
                      ...branding,
                      fontPreset: e.target.value as Branding["fontPreset"],
                    })
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="system">System (default)</option>
                  <option value="serif">Serif</option>
                  <option value="rounded">Rounded</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="widget-position" className="text-xs">
                  Launcher corner
                </Label>
                <select
                  id="widget-position"
                  value={branding.launcherPosition}
                  onChange={(e) =>
                    setBranding({
                      ...branding,
                      launcherPosition: e.target
                        .value as Branding["launcherPosition"],
                    })
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="bottom-right">Bottom right</option>
                  <option value="bottom-left">Bottom left</option>
                </select>
              </div>
            </section>

            <Separator />

            <section className="flex flex-col gap-3">
              <p className="text-sm font-medium">Greeting and starter prompts</p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="widget-greeting" className="text-xs">
                  Greeting
                </Label>
                <Input
                  id="widget-greeting"
                  value={branding.greeting}
                  onChange={(e) =>
                    setBranding({ ...branding, greeting: e.target.value })
                  }
                  placeholder="Hi! Welcome to our restaurant. How can I help you?"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="widget-prompts" className="text-xs">
                  Starter prompts (one per line, up to 6)
                </Label>
                <textarea
                  id="widget-prompts"
                  rows={4}
                  value={branding.starterPrompts.join("\n")}
                  onChange={(e) =>
                    setBranding({
                      ...branding,
                      starterPrompts: e.target.value.split("\n"),
                    })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </section>

            <Separator />

            <section className="flex flex-col gap-3">
              <p className="text-sm font-medium">What the widget shows</p>
              <ToggleRow
                label="Product photos"
                checked={branding.showImages}
                onChange={(value) =>
                  setBranding({ ...branding, showImages: value })
                }
              />
              <ToggleRow
                label="Product cards in chat"
                checked={branding.showProducts}
                onChange={(value) =>
                  setBranding({ ...branding, showProducts: value })
                }
              />
              <ToggleRow
                label="Cart and checkout"
                checked={branding.showCart}
                onChange={(value) => setBranding({ ...branding, showCart: value })}
              />
              <ToggleRow
                label="CafeConnect credit"
                checked={branding.showStorefrontLink}
                onChange={(value) =>
                  setBranding({ ...branding, showStorefrontLink: value })
                }
              />
            </section>

            <Separator />

            <section className="flex flex-col gap-3">
              <p className="text-sm font-medium">Install on your website</p>
              <CodeBlock
                label="Embed snippet (paste before </body>)"
                value={embedSnippet}
                copied={copied === "embed"}
                onCopy={() => void copy(embedSnippet, "embed")}
              />
              <CodeBlock
                label="Full-page chat link"
                value={widgetUrl}
                copied={copied === "widget"}
                onCopy={() => void copy(widgetUrl, "widget")}
                open
              />
              <CodeBlock
                label="Online ordering link"
                value={storeUrl}
                copied={copied === "store"}
                onCopy={() => void copy(storeUrl, "store")}
                open
              />
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-xs text-muted-foreground">
                <li>Paste the snippet anywhere in your website HTML.</li>
                <li>
                  The loader is async, so it never slows down your page.
                </li>
                <li>
                  The chat runs in an isolated frame, so your site CSS cannot
                  break it.
                </li>
                <li>
                  Only the public widget id is used - it exposes no keys and no
                  private data.
                </li>
              </ol>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={`toggle-${label}`} className="text-sm font-normal">
        {label}
      </Label>
      <Switch
        id={`toggle-${label}`}
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  );
}

function CodeBlock({
  label,
  value,
  copied,
  onCopy,
  open,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  open?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium">{label}</p>
      <div className="flex items-start gap-2">
        <code className="flex-1 overflow-x-auto rounded-md border border-border bg-muted px-2 py-1.5 text-xs whitespace-pre-wrap break-all">
          {value}
        </code>
        <div className="flex shrink-0 gap-1">
          {open ? (
            <Button variant="outline" size="sm" asChild>
              <a href={value} target="_blank" rel="noreferrer noopener">
                <ExternalLink />
                <span className="sr-only">Open</span>
              </a>
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onCopy}>
            {copied ? <Check /> : <Copy />}
            <span className="sr-only">Copy</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
