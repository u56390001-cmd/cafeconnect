import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getAdminDb } from "@/lib/firebase/admin";
import { handleApiError } from "@/lib/api/response";
import {
  normalizeInboundMessages,
  verifyMetaSignature,
} from "@/lib/whatsapp/meta-cloud";
import { resolveTenantByMetaPhoneNumberId } from "@/lib/whatsapp/mapping";
import { enqueueInboxEvent } from "@/lib/whatsapp/inbox";
import { processInboxEvent } from "@/lib/whatsapp/worker";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken && verifyToken) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    if (!verifyMetaSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const messages = normalizeInboundMessages(payload);
    if (messages.length === 0) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const db = getAdminDb();
    const background: Array<() => Promise<unknown>> = [];

    for (const message of messages) {
      const dedupeRef = db.collection("whatsappEventLog").doc(message.messageId);
      const dedupeSnap = await dedupeRef.get();
      if (dedupeSnap.exists) continue;

      const tenantId = await resolveTenantByMetaPhoneNumberId(
        message.phoneNumberId
      );
      if (!tenantId) continue;

      const text = message.text?.trim();
      if (!text) continue;

      await dedupeRef.set({
        eventId: message.messageId,
        channel: "whatsapp_meta",
        tenantId,
        receivedAt: new Date(),
        from: message.from,
        phoneNumberId: message.phoneNumberId,
      });

      await enqueueInboxEvent({
        eventId: message.messageId,
        tenantId,
        channel: "whatsapp_meta",
        customerReference: message.from,
        text,
        providerEvent: message as unknown as Record<string, unknown>,
      });

      background.push(() => processInboxEvent(tenantId, message.messageId));
    }

    // Meta expects a fast 2xx; the AI reply and send happen in the background.
    for (const task of background) {
      try {
        waitUntil(task().catch(() => undefined));
      } catch {
        void task().catch(() => undefined);
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: unknown) {
    return handleApiError("api/webhooks/whatsapp/meta", error);
  }
}
