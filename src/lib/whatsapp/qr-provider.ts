export type QrSessionStatus =
  | "connected"
  | "starting"
  | "qr"
  | "disconnected"
  | "error";

export interface QrSessionInfo {
  status: QrSessionStatus;
  phone: string | null;
  qr: string | null;
  webhook: string | null;
  message: string | null;
}

export interface QrSendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface QrWebhookEvent {
  event: string;
  id: string;
  timestamp: number;
  to: string;
  from: string;
  name: string | null;
  group: string | null;
  type: string;
  text: string | null;
  media: { mimetype: string; fileName: string | null; size: number; seconds: number | null } | null;
  location: { latitude: number; longitude: number; name: string | null; address: string | null } | null;
  replyTo: string | null;
}

export class QrProviderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "QrProviderError";
  }
}

function baseUrl(): string {
  const url = process.env.QR_PROVIDER_BASE_URL?.trim();
  if (!url) {
    throw new QrProviderError("QR provider is not configured on this deployment", 503);
  }
  return url.replace(/\/+$/, "");
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token.trim()}`,
    "Content-Type": "application/json",
  };
}

async function providerFetch(
  path: string,
  init: RequestInit,
  token: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { ...authHeaders(token), ...(init.headers ?? {}) },
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getQrSession(token: string): Promise<QrSessionInfo> {
  let res: Response;
  try {
    res = await providerFetch("/api/session", { method: "GET" }, token);
  } catch {
    throw new QrProviderError("QR provider is unreachable", 503);
  }

  if (!res.ok) {
    throw new QrProviderError("QR provider session check failed", 502);
  }

  const data = (await res.json()) as {
    status?: string;
    phone?: string | null;
    qr?: string | null;
    webhook?: string | null;
    message?: string | null;
  };

  const status = (data.status ?? "disconnected") as QrSessionStatus;
  return {
    status,
    phone: data.phone ? normalizePhone(data.phone) : null,
    qr: data.qr ?? null,
    webhook: data.webhook ?? null,
    message: data.message ?? null,
  };
}

export async function sendQrText(
  token: string,
  to: string,
  text: string
): Promise<QrSendResult> {
  let res: Response;
  try {
    res = await providerFetch(
      "/api/send",
      {
        method: "POST",
        body: JSON.stringify({ to: normalizePhone(to), text }),
      },
      token
    );
  } catch {
    throw new QrProviderError("QR provider is unreachable", 503);
  }

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    id?: string;
    error?: string;
  };

  if (!res.ok || data.ok === false) {
    throw new QrProviderError(
      data.error ?? "QR provider rejected the message",
      502
    );
  }

  return { ok: true, id: data.id };
}

export async function registerQrWebhook(
  token: string,
  url: string
): Promise<{ secret: string | null; url: string }> {
  let res: Response;
  try {
    res = await providerFetch(
      "/api/webhook",
      { method: "POST", body: JSON.stringify({ url }) },
      token
    );
  } catch {
    throw new QrProviderError("QR provider is unreachable", 503);
  }
  if (!res.ok) {
    throw new QrProviderError("Failed to register QR provider webhook", 502);
  }

  const data = (await res.json().catch(() => ({}))) as {
    webhook?: { url?: string; secret?: string };
  };

  return {
    secret: data.webhook?.secret ?? null,
    url: data.webhook?.url ?? url,
  };
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}
