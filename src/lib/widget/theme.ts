/**
 * Widget theme helpers that are safe to use in the browser.
 *
 * The service module (`@/lib/widget/service`) talks to Firestore and must
 * never be imported by a client component, so the pure colour and branding
 * helpers live here and are re-exported by the service.
 */

export type WidgetThemeMode = "light" | "dark" | "auto";
export type WidgetRadius = "soft" | "sharp" | "round";
export type WidgetLauncherPosition = "bottom-right" | "bottom-left";
export type WidgetDensity = "compact" | "comfortable";
export type WidgetFontPreset = "system" | "serif" | "rounded";

export interface WidgetBranding {
  primaryColor: string;
  accentColor: string;
  themeMode: WidgetThemeMode;
  radius: WidgetRadius;
  density: WidgetDensity;
  fontPreset: WidgetFontPreset;
  logoUrl: string;
  launcherPosition: WidgetLauncherPosition;
  launcherLabel: string;
  greeting: string;
  starterPrompts: string[];
  showImages: boolean;
  showProducts: boolean;
  showCart: boolean;
  showStorefrontLink: boolean;
}

export const DEFAULT_BRANDING: WidgetBranding = {
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

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function sanitizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

/** Relative luminance contrast ratio between two hex colours (WCAG). */
export function contrastRatio(hexA: string, hexB: string): number {
  const luminance = (hex: string) => {
    const value = hex.replace("#", "");
    const full =
      value.length === 3
        ? value
            .split("")
            .map((char) => char + char)
            .join("")
        : value;
    const channels = [0, 2, 4].map((offset) => {
      const channel = parseInt(full.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return (
      channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
    );
  };
  const a = luminance(hexA);
  const b = luminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function sanitizePrompts(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_BRANDING.starterPrompts;
  const prompts = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.length <= 80)
    .slice(0, 6);
  return prompts.length > 0 ? prompts : DEFAULT_BRANDING.starterPrompts;
}

function sanitizeLogoUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  // Only https or same-origin paths; no javascript:, no data: payloads.
  if (/^https:\/\//i.test(trimmed) || trimmed.startsWith("/")) {
    return trimmed.slice(0, 300);
  }
  return "";
}

/** Normalises a stored or submitted branding payload. */
export function sanitizeBranding(
  input: Record<string, unknown> | undefined,
  base: WidgetBranding = DEFAULT_BRANDING
): WidgetBranding {
  const data = input ?? {};
  return {
    primaryColor: sanitizeHexColor(data.primaryColor, base.primaryColor),
    accentColor: sanitizeHexColor(data.accentColor, base.accentColor),
    themeMode: sanitizeEnum<WidgetThemeMode>(
      data.themeMode,
      ["light", "dark", "auto"],
      base.themeMode
    ),
    radius: sanitizeEnum<WidgetRadius>(
      data.radius,
      ["soft", "sharp", "round"],
      base.radius
    ),
    density: sanitizeEnum<WidgetDensity>(
      data.density,
      ["compact", "comfortable"],
      base.density
    ),
    fontPreset: sanitizeEnum<WidgetFontPreset>(
      data.fontPreset,
      ["system", "serif", "rounded"],
      base.fontPreset
    ),
    logoUrl: sanitizeLogoUrl(data.logoUrl ?? base.logoUrl),
    launcherPosition: sanitizeEnum<WidgetLauncherPosition>(
      data.launcherPosition,
      ["bottom-right", "bottom-left"],
      base.launcherPosition
    ),
    launcherLabel: (() => {
      const label =
        typeof data.launcherLabel === "string" ? data.launcherLabel.trim() : "";
      return label.length > 0 && label.length <= 40 ? label : base.launcherLabel;
    })(),
    greeting: (() => {
      const greeting =
        typeof data.greeting === "string" ? data.greeting.trim() : "";
      return greeting.length <= 240 ? greeting : base.greeting;
    })(),
    starterPrompts:
      data.starterPrompts === undefined
        ? base.starterPrompts
        : sanitizePrompts(data.starterPrompts),
    showImages: sanitizeBoolean(data.showImages, base.showImages),
    showProducts: sanitizeBoolean(data.showProducts, base.showProducts),
    showCart: sanitizeBoolean(data.showCart, base.showCart),
    showStorefrontLink: sanitizeBoolean(
      data.showStorefrontLink,
      base.showStorefrontLink
    ),
  };
}
