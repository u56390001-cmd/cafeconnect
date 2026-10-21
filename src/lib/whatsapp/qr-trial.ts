import { getAdminDb } from "@/lib/firebase/admin";
import { tenantDoc } from "@/lib/tenancy/resolver";
import {
  getQrSession,
  registerQrWebhook,
  type QrSessionInfo,
} from "./qr-provider";

export const QR_TRIAL_DAYS = 7;
export const QR_TRIAL_MESSAGE_QUOTA = 500;

export type QrTrialStatus =
  | "not_configured"
  | "pending_scan"
  | "connected"
  | "disconnected"
  | "expired"
  | "error";

export interface QrTrialState {
  status: QrTrialStatus;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  linkedPhone: string | null;
  messagesUsed: number;
  messageQuota: number;
  lastHealthCheckAt: string | null;
  provider: string;
  mode: string;
}

function providerToken(): string {
  const token = process.env.QR_PROVIDER_API_KEY;
  if (!token) {
    throw new Error("QR provider is not configured on this deployment");
  }
  return token;
}

export function qrProviderConfigured(): boolean {
  return Boolean(process.env.QR_PROVIDER_BASE_URL && process.env.QR_PROVIDER_API_KEY);
}

export function webhookPublicUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.QR_PROVIDER_WEBHOOK_BASE_URL ||
    "";
  if (!base) {
    throw new Error("Missing NEXT_PUBLIC_APP_URL for webhook registration");
  }
  return `${base.replace(/\/+$/, "")}/api/webhooks/whatsapp/qr`;
}

export async function readQrTrialState(tenantId: string): Promise<QrTrialState> {
  const snap = await tenantDoc(tenantId, "settings", "whatsapp").get();
  const data = snap.exists ? snap.data() : undefined;
  const trial = (data?.qrTrial ?? {}) as Record<string, unknown>;

  return {
    status: (trial.status as QrTrialStatus) ?? "not_configured",
    trialStartedAt: (trial.trialStartedAt as string) ?? null,
    trialEndsAt: (trial.trialEndsAt as string) ?? null,
    linkedPhone: (trial.linkedPhone as string) ?? null,
    messagesUsed: Number(trial.messagesUsed ?? 0),
    messageQuota: Number(trial.messageQuota ?? QR_TRIAL_MESSAGE_QUOTA),
    lastHealthCheckAt: (trial.lastHealthCheckAt as string) ?? null,
    provider: (data?.provider as string) ?? "qr_provider",
    mode: (data?.mode as string) ?? "qr_trial",
  };
}

export async function startQrTrial(
  tenantId: string,
  userId: string
): Promise<QrTrialState> {
  const token = providerToken();
  const now = new Date();
  const endsAt = new Date(now.getTime() + QR_TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const state: QrTrialState = {
    status: "pending_scan",
    trialStartedAt: now.toISOString(),
    trialEndsAt: endsAt.toISOString(),
    linkedPhone: null,
    messagesUsed: 0,
    messageQuota: QR_TRIAL_MESSAGE_QUOTA,
    lastHealthCheckAt: now.toISOString(),
    provider: "qr_provider",
    mode: "qr_trial",
  };

  await tenantDoc(tenantId, "settings", "whatsapp").set(
    {
      tenantId,
      mode: "qr_trial",
      provider: "qr_provider",
      status: "pending_scan",
      qrTrial: state,
      trialStartedBy: userId,
      updatedAt: now,
    },
    { merge: true }
  );

  await registerQrWebhook(token, webhookPublicUrl());

  return state;
}

export async function refreshQrTrialConnection(
  tenantId: string
): Promise<QrTrialState> {
  const token = providerToken();
  const current = await readQrTrialState(tenantId);
  const now = new Date();

  if (current.trialEndsAt && new Date(current.trialEndsAt).getTime() <= now.getTime()) {
    const expired: QrTrialState = { ...current, status: "expired" };
    await persistTrialState(tenantId, expired);
    return expired;
  }

  let session: QrSessionInfo;
  try {
    session = await getQrSession(token);
  } catch {
    const errored: QrTrialState = { ...current, status: "error" };
    await persistTrialState(tenantId, errored);
    return errored;
  }

  const status: QrTrialStatus =
    session.status === "connected"
      ? "connected"
      : session.status === "qr" || session.status === "starting"
        ? "pending_scan"
        : "disconnected";

  const next: QrTrialState = {
    ...current,
    status,
    linkedPhone: session.phone ?? current.linkedPhone,
    lastHealthCheckAt: now.toISOString(),
  };

  await persistTrialState(tenantId, next);

  if (next.linkedPhone) {
    await mapPhoneToTenant(next.linkedPhone, tenantId);
  }

  return next;
}

async function persistTrialState(
  tenantId: string,
  state: QrTrialState
): Promise<void> {
  await tenantDoc(tenantId, "settings", "whatsapp").set(
    {
      tenantId,
      status: state.status === "connected" ? "active" : state.status,
      qrTrial: state,
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

async function mapPhoneToTenant(
  phone: string,
  tenantId: string
): Promise<void> {
  await getAdminDb()
    .collection("whatsappSessions")
    .doc(phone)
    .set(
      {
        phone,
        tenantId,
        provider: "qr_provider",
        updatedAt: new Date(),
      },
      { merge: true }
    );
}

export async function resolveTenantByPhone(
  phone: string
): Promise<string | null> {
  const snap = await getAdminDb().collection("whatsappSessions").doc(phone).get();
  if (!snap.exists) return null;
  return (snap.data()?.tenantId as string) ?? null;
}

export interface TrialCheck {
  allowed: boolean;
  reason: string | null;
  state: QrTrialState;
}

export async function checkTrialAllowed(
  tenantId: string
): Promise<TrialCheck> {
  const state = await readQrTrialState(tenantId);
  const now = Date.now();

  if (!state.trialStartedAt) {
    return { allowed: false, reason: "trial_not_started", state };
  }
  if (state.trialEndsAt && new Date(state.trialEndsAt).getTime() <= now) {
    return { allowed: false, reason: "trial_expired", state };
  }
  if (state.messagesUsed >= state.messageQuota) {
    return { allowed: false, reason: "quota_exceeded", state };
  }
  return { allowed: true, reason: null, state };
}

export async function recordTrialUsage(tenantId: string): Promise<void> {
  const state = await readQrTrialState(tenantId);
  await persistTrialState(tenantId, {
    ...state,
    messagesUsed: state.messagesUsed + 1,
  });
}

export async function stopQrTrial(tenantId: string): Promise<void> {
  const state = await readQrTrialState(tenantId);
  await persistTrialState(tenantId, { ...state, status: "disconnected" });
  if (state.linkedPhone) {
    await getAdminDb().collection("whatsappSessions").doc(state.linkedPhone).delete();
  }
}
