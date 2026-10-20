import { getAdminDb } from "@/lib/firebase/admin";
import { randomUUID } from "crypto";

export interface WidgetConfig {
  publicWidgetId: string;
  tenantId: string;
  enabled: boolean;
  greeting: string;
  primaryColor: string;
  allowStore: boolean;
  createdAt: Date;
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
      greeting: data.greeting ?? "",
      primaryColor: data.primaryColor ?? "#ea580c",
      allowStore: data.allowStore !== false,
      createdAt: (data.createdAt as Date) ?? new Date(),
    };
  }

  const publicWidgetId = `wa_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  await db.collection("widgetConfigs").doc(publicWidgetId).set({
    publicWidgetId,
    tenantId,
    enabled: true,
    greeting: "",
    primaryColor: "#ea580c",
    allowStore: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return {
    publicWidgetId,
    tenantId,
    enabled: true,
    greeting: "",
    primaryColor: "#ea580c",
    allowStore: true,
    createdAt: new Date(),
  };
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
    greeting: (data.greeting as string | undefined) ?? "",
    primaryColor: (data.primaryColor as string | undefined) ?? "#ea580c",
    allowStore: data.allowStore !== false,
    createdAt: (data.createdAt as Date) ?? new Date(),
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
