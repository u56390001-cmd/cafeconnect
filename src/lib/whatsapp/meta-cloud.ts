import { createHmac, timingSafeEqual } from "crypto";

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || "v20.0";

export interface MetaInboundMessage {
  messageId: string;
  from: string;
  text: string | null;
  timestamp: string | null;
  phoneNumberId: string;
}

export class MetaApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "MetaApiError";
  }
}

export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signatureHeader) return false;

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function normalizeInboundMessages(
  payload: Record<string, unknown>
): MetaInboundMessage[] {
  const results: MetaInboundMessage[] = [];

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = Array.isArray((entry as { changes?: unknown }).changes)
      ? ((entry as { changes: unknown[] }).changes)
      : [];
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as { value?: Record<string, unknown> }).value;
      if (!value) continue;

      const phoneNumberId = String(
        (value.metadata as { phone_number_id?: string } | undefined)?.phone_number_id ??
          ""
      );
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of messages) {
        if (!message || typeof message !== "object") continue;
        const m = message as {
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        };
        if (!m.id) continue;
        results.push({
          messageId: m.id,
          from: String(m.from ?? ""),
          text: m.text?.body ?? null,
          timestamp: m.timestamp ?? null,
          phoneNumberId,
        });
      }
    }
  }

  return results;
}

export async function sendMetaText(input: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  text: string;
}): Promise<{ messageId: string | null }> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${input.phoneNumberId}/messages`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to,
        type: "text",
        text: { preview_url: false, body: input.text },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };

    if (!res.ok) {
      throw new MetaApiError(
        data.error?.message ?? "Meta WhatsApp API rejected the message",
        502
      );
    }

    return { messageId: data.messages?.[0]?.id ?? null };
  } finally {
    clearTimeout(timeout);
  }
}
