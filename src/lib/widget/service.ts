import { getAdminDb } from "@/lib/firebase/admin";
import { randomUUID } from "crypto";
import {
  DEFAULT_BRANDING,
  sanitizeBranding,
  type WidgetBranding,
  type WidgetDensity,
  type WidgetFontPreset,
  type WidgetLauncherPosition,
  type WidgetRadius,
  type WidgetThemeMode,
} from "./theme";

/**
 * Widget configuration (public widget identity + branding).
 *
 * Only the public widget id is ever exposed to a browser. Everything stored
 * here is a *display* setting: colours, radius, launcher placement, prompts.
 * No credential, no tenant secret.
 *
 * The pure theming helpers live in `@/lib/widget/theme` so that client
 * components never pull the Firebase Admin SDK into the browser bundle.
 */

export {
  DEFAULT_BRANDING,
  sanitizeBranding,
  sanitizeHexColor,
  contrastRatio,
} from "./theme";
export type {
  WidgetBranding,
  WidgetDensity,
  WidgetFontPreset,
  WidgetLauncherPosition,
  WidgetRadius,
  WidgetThemeMode,
} from "./theme";

export interface WidgetConfig extends WidgetBranding {
  publicWidgetId: string;
  tenantId: string;
  enabled: boolean;
  allowStore: boolean;
  createdAt: Date;
}

function brandingFromData(data: Record<string, unknown>): WidgetBranding {
  return sanitizeBranding(data as Record<string, unknown>, DEFAULT_BRANDING);
}

export async function ensureWidgetConfig(
  tenantId: string
): Promise<WidgetConfig> {
  const db = getAdminDb();
  const existing = await db
    .collection("widgetConfigs")
    .where("tenantId", "==", tenantId)
    .limit(1)
    .get();

  if (!existing.empty) {
    const data = existing.docs[0].data();
    return {
      publicWidgetId: data.publicWidgetId,
      tenantId,
      enabled: data.enabled !== false,
      allowStore: data.allowStore !== false,
      createdAt: (data.createdAt as Date) ?? new Date(),
      ...brandingFromData(data),
    };
  }

  const publicWidgetId = `wa_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  await db.collection("widgetConfigs").doc(publicWidgetId).set({
    publicWidgetId,
    tenantId,
    enabled: true,
    allowStore: true,
    ...DEFAULT_BRANDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return {
    publicWidgetId,
    tenantId,
    enabled: true,
    allowStore: true,
    createdAt: new Date(),
    ...DEFAULT_BRANDING,
  };
}

/** Updates the branding of a tenant widget (dashboard settings). */
export async function updateWidgetBranding(
  tenantId: string,
  patch: Record<string, unknown>
): Promise<WidgetConfig> {
  const config = await ensureWidgetConfig(tenantId);
  const current = brandingFromData(
    config as unknown as Record<string, unknown>
  );
  const branding = sanitizeBranding(patch, current);
  await getAdminDb()
    .collection("widgetConfigs")
    .doc(config.publicWidgetId)
    .set({ ...branding, updatedAt: new Date() }, { merge: true });
  return { ...config, ...branding };
}

export async function resolveWidget(
  publicWidgetId: string
): Promise<WidgetConfig | null> {
  if (!publicWidgetId || publicWidgetId.length > 64) return null;
  const snap = await getAdminDb()
    .collection("widgetConfigs")
    .doc(publicWidgetId)
    .get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (!data) return null;
  if (data.enabled === false) return null;
  return {
    publicWidgetId,
    tenantId: data.tenantId as string,
    enabled: data.enabled !== false,
    allowStore: data.allowStore !== false,
    createdAt: (data.createdAt as Date) ?? new Date(),
    ...brandingFromData(data),
  };
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  return true;
}
