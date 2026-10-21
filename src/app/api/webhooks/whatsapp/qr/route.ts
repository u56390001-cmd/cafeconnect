import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { handleApiError } from "@/lib/api/response";
import {
  checkTrialAllowed,
  recordTrialUsage,
  resolveTenantByPhone,
} from "@/lib/whatsapp/qr-trial";
import { sendQrText, normalizePhone, type QrWebhookEvent } from "@/lib/whatsapp/qr-provider";
import { respondToCustomer } from "@/lib/ai/orchestrator";
import { getTenantApiKey } from "@/lib/settings/keys";

export const dynamic = "force-dynamic";

function verifySignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.QR_PROVIDER_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signatureHeader) return false;

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-webhook-signature");

    if (!verifySignature(rawBody, signature)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let event: QrWebhookEvent;
    try {
      event = JSON.parse(rawBody) as QrWebhookEvent;
    } catch {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    if (!event || event.event !== "message" || !event.id) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const db = getAdminDb();

    // Deduplicate by provider message id (idempotent webhook processing).
    const dedupeRef = db.collection("whatsappEventLog").doc(event.id);
    const dedupeSnap = await dedupeRef.get();
    if (dedupeSnap.exists) {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }
    await dedupeRef.set({
      eventId: event.id,
      receivedAt: new Date(),
      from: event.from ?? null,
      to: event.to ?? null,
    });

    const linkedPhone = normalizePhone(event.to ?? "");
    const tenantId = await resolveTenantByPhone(linkedPhone);
    if (!tenantId) {
      return NextResponse.json({ received: true, mapped: false }, { status: 200 });
    }

    const trial = await checkTrialAllowed(tenantId);
    if (!trial.allowed) {
      return NextResponse.json(
        { received: true, sent: false, reason: trial.reason },
        { status: 200 }
      );
    }

    const incomingText = event.text?.trim();
    if (!incomingText) {
      return NextResponse.json({ received: true, sent: false, reason: "no_text" }, { status: 200 });
    }

    const customerReference = normalizePhone(event.from ?? "");

    const reply = await respondToCustomer({
      tenantId,
      channel: "whatsapp_qr",
      message: incomingText,
      customerReference,
    });

    const providerToken =
      (await getTenantApiKey(tenantId, "qr_provider"))?.key ??
      process.env.QR_PROVIDER_API_KEY;

    if (!providerToken) {
      return NextResponse.json({ received: true, sent: false, reason: "no_provider_token" }, { status: 200 });
    }

    await sendQrText(providerToken, customerReference, reply.reply);
    await recordTrialUsage(tenantId);

    return NextResponse.json({ received: true, sent: true }, { status: 200 });
  } catch (error: unknown) {
    return handleApiError("api/webhooks/whatsapp/qr", error);
  }
}
