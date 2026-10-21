import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  checkTrialAllowed,
  resolveTenantByPhone,
  resolveTenantByWebhookToken,
  getTenantWebhookSecret,
} from "@/lib/whatsapp/qr-trial";
import { normalizePhone, type QrWebhookEvent } from "@/lib/whatsapp/qr-provider";
import { enqueueInboxEvent } from "@/lib/whatsapp/inbox";
import { processInboxEvent } from "@/lib/whatsapp/worker";

function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!secret || !signatureHeader) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Handles an inbound QR-provider webhook.
 *
 * The provider expects a 2xx within ~10 seconds, so we verify, deduplicate and
 * enqueue the event and answer immediately. The AI reply and the WhatsApp send
 * happen in the background (and are retried by the cron worker if needed).
 */
export async function handleQrWebhook(
  request: NextRequest,
  webhookToken: string | null
): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");

  let event: QrWebhookEvent;
  try {
    event = JSON.parse(rawBody) as QrWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  let tenantId = webhookToken
    ? await resolveTenantByWebhookToken(webhookToken)
    : null;

  if (!tenantId && event?.to) {
    tenantId = await resolveTenantByPhone(normalizePhone(event.to));
  }

  if (!tenantId) {
    return NextResponse.json({ error: "Unknown session" }, { status: 404 });
  }

  const tenantSecret = await getTenantWebhookSecret(tenantId);
  const platformSecret = process.env.QR_PROVIDER_WEBHOOK_SECRET?.trim();

  const verified =
    (tenantSecret && verifySignature(rawBody, signature, tenantSecret)) ||
    (platformSecret && verifySignature(rawBody, signature, platformSecret));

  if (!verified) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    channel: "whatsapp_qr",
    tenantId,
    receivedAt: new Date(),
    from: event.from ?? null,
    to: event.to ?? null,
  });

  const trial = await checkTrialAllowed(tenantId);
  if (!trial.allowed) {
    return NextResponse.json(
      { received: true, sent: false, reason: trial.reason },
      { status: 200 }
    );
  }

  const incomingText = event.text?.trim();
  if (!incomingText) {
    return NextResponse.json(
      { received: true, sent: false, reason: "no_text" },
      { status: 200 }
    );
  }

  const customerReference = normalizePhone(event.from ?? "");

  await enqueueInboxEvent({
    eventId: event.id,
    tenantId,
    channel: "whatsapp_qr",
    customerReference,
    text: incomingText,
    providerEvent: event as unknown as Record<string, unknown>,
  });

  // Answer the provider immediately; process the reply in the background.
  scheduleBackground(() => processInboxEvent(tenantId as string, event.id));

  return NextResponse.json({ received: true, queued: true }, { status: 200 });
}

/**
 * Registers background work with the platform runtime so the function stays
 * alive after the response is sent. The cron worker retries anything that is
 * still pending.
 */
function scheduleBackground(task: () => Promise<unknown>): void {
  try {
    waitUntil(task().catch(() => undefined));
  } catch {
    void task().catch(() => undefined);
  }
}
