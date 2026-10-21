import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { handleApiError } from "@/lib/api/response";
import {
  normalizeInboundMessages,
  sendMetaText,
  verifyMetaSignature,
} from "@/lib/whatsapp/meta-cloud";
import { resolveTenantByMetaPhoneNumberId } from "@/lib/whatsapp/mapping";
import { getTenantApiKey } from "@/lib/settings/keys";
import { respondToCustomer } from "@/lib/ai/orchestrator";
import { tenantDoc } from "@/lib/tenancy/resolver";

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

    for (const message of messages) {
      const dedupeRef = db.collection("whatsappEventLog").doc(message.messageId);
      const dedupeSnap = await dedupeRef.get();
      if (dedupeSnap.exists) continue;
      await dedupeRef.set({
        eventId: message.messageId,
        channel: "whatsapp_meta",
        receivedAt: new Date(),
        from: message.from,
        phoneNumberId: message.phoneNumberId,
      });

      const tenantId = await resolveTenantByMetaPhoneNumberId(
        message.phoneNumberId
      );
      if (!tenantId) continue;

      const text = message.text?.trim();
      if (!text) continue;

      const accessToken =
        (await getTenantApiKey(tenantId, "meta_whatsapp"))?.key ??
        process.env.WHATSAPP_ACCESS_TOKEN;
      if (!accessToken) continue;

      const settingsSnap = await tenantDoc(tenantId, "settings", "whatsapp").get();
      const phoneNumberId =
        (settingsSnap.data()?.phoneNumberId as string | undefined) ??
        message.phoneNumberId;
      if (!phoneNumberId) continue;

      const reply = await respondToCustomer({
        tenantId,
        channel: "whatsapp_meta",
        message: text,
        customerReference: message.from,
      });

      await sendMetaText({
        accessToken,
        phoneNumberId,
        to: message.from,
        text: reply.reply,
      });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: unknown) {
    return handleApiError("api/webhooks/whatsapp/meta", error);
  }
}
