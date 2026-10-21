import { respondToCustomer } from "@/lib/ai/orchestrator";
import { getTenantApiKey } from "@/lib/settings/keys";
import { sendMetaText, type MetaInboundMessage } from "./meta-cloud";
import { sendQrText, normalizePhone } from "./qr-provider";
import { checkTrialAllowed } from "./qr-trial";
import {
  getInboxEvent,
  listPendingInboxEvents,
  markInboxEvent,
  type InboxEvent,
} from "./inbox";
import { tenantDoc } from "@/lib/tenancy/resolver";

export interface ProcessResult {
  eventId: string;
  status: "sent" | "skipped" | "failed";
  reason?: string | null;
}

async function processQrEvent(event: InboxEvent): Promise<ProcessResult> {
  const trial = await checkTrialAllowed(event.tenantId);
  if (!trial.allowed) {
    await markInboxEvent(event.tenantId, event.eventId, {
      status: "skipped",
      lastError: trial.reason,
    });
    return { eventId: event.eventId, status: "skipped", reason: trial.reason };
  }

  const providerToken =
    (await getTenantApiKey(event.tenantId, "qr_provider"))?.key ??
    process.env.QR_PROVIDER_API_KEY?.trim();
  if (!providerToken) {
    await markInboxEvent(event.tenantId, event.eventId, {
      status: "failed",
      lastError: "no_provider_token",
    });
    return { eventId: event.eventId, status: "failed", reason: "no_provider_token" };
  }

  const reply = await respondToCustomer({
    tenantId: event.tenantId,
    channel: "whatsapp_qr",
    message: event.text,
    customerReference: event.customerReference,
  });

  await sendQrText(providerToken, event.customerReference, reply.reply);

  await markInboxEvent(event.tenantId, event.eventId, {
    status: "sent",
    lastError: null,
    attempts: event.attempts + 1,
  });
  return { eventId: event.eventId, status: "sent" };
}

async function processMetaEvent(event: InboxEvent): Promise<ProcessResult> {
  const accessToken =
    (await getTenantApiKey(event.tenantId, "meta_whatsapp"))?.key ??
    process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    await markInboxEvent(event.tenantId, event.eventId, {
      status: "failed",
      lastError: "no_meta_token",
    });
    return { eventId: event.eventId, status: "failed", reason: "no_meta_token" };
  }

  const settingsSnap = await tenantDoc(event.tenantId, "settings", "whatsapp").get();
  const phoneNumberId = settingsSnap.data()?.phoneNumberId as string | undefined;
  if (!phoneNumberId) {
    await markInboxEvent(event.tenantId, event.eventId, {
      status: "failed",
      lastError: "no_phone_number_id",
    });
    return { eventId: event.eventId, status: "failed", reason: "no_phone_number_id" };
  }

  const reply = await respondToCustomer({
    tenantId: event.tenantId,
    channel: "whatsapp_meta",
    message: event.text,
    customerReference: event.customerReference,
  });

  await sendMetaText({
    accessToken,
    phoneNumberId,
    to: event.customerReference,
    text: reply.reply,
  });

  await markInboxEvent(event.tenantId, event.eventId, {
    status: "sent",
    lastError: null,
    attempts: event.attempts + 1,
  });
  return { eventId: event.eventId, status: "sent" };
}

export async function processInboxEvent(
  tenantId: string,
  eventId: string
): Promise<ProcessResult> {
  const event = await getInboxEvent(tenantId, eventId);
  if (!event) return { eventId, status: "skipped", reason: "not_found" };
  if (event.status === "sent" || event.status === "skipped") {
    return { eventId, status: "skipped", reason: "already_processed" };
  }

  await markInboxEvent(tenantId, eventId, {
    status: "processing",
    attempts: event.attempts + 1,
  });

  try {
    if (event.channel === "whatsapp_qr") {
      return await processQrEvent(event);
    }
    return await processMetaEvent(event);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message.slice(0, 300) : "unknown error";
    console.error(
      `[whatsapp-worker] scope=processInboxEvent tenant=${tenantId} event=${eventId} message=${message}`
    );
    await markInboxEvent(tenantId, eventId, {
      status: "failed",
      lastError: message,
    });
    return { eventId, status: "failed", reason: message };
  }
}

/**
 * Drains pending inbox events. Used by the cron endpoint as a safety net for
 * events whose background processing was interrupted.
 */
export async function drainInbox(limit = 10): Promise<ProcessResult[]> {
  const pending = await listPendingInboxEvents(limit);
  const results: ProcessResult[] = [];

  for (const event of pending) {
    if (event.status !== "pending") continue;
    results.push(await processInboxEvent(event.tenantId, event.eventId));
  }

  return results;
}
