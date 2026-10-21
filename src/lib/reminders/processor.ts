import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";
import {
  dueReminders,
  markReminder,
  scheduleReminder,
  type Reminder,
} from "./scheduler";
import { checkMessagingPolicy, recordSentMessage } from "./policy";
import { sendQrText } from "../whatsapp/qr-provider";
import { sendMetaText } from "../whatsapp/meta-cloud";
import { getTenantApiKey } from "../settings/keys";

/**
 * Reminder processing (Phase 6).
 *
 * Every proactive message goes through the policy router, and a sent message
 * is recorded so the same reminder can never be sent twice.
 */

export interface ReminderProcessResult {
  processed: number;
  sent: number;
  suppressed: number;
  failed: number;
  reasons: Record<string, number>;
}

export async function processDueReminders(
  tenantId: string,
  now = new Date()
): Promise<ReminderProcessResult> {
  const result: ReminderProcessResult = {
    processed: 0,
    sent: 0,
    suppressed: 0,
    failed: 0,
    reasons: {},
  };

  const reminders = await dueReminders(tenantId, now, 20);
  result.processed = reminders.length;

  for (const reminder of reminders) {
    const outcome = await sendReminder(tenantId, reminder, now);
    result.reasons[outcome.reason] = (result.reasons[outcome.reason] ?? 0) + 1;
    if (outcome.sent) result.sent += 1;
    else if (outcome.reason === "failed") result.failed += 1;
    else result.suppressed += 1;
  }

  return result;
}

interface SendOutcome {
  sent: boolean;
  reason: string;
}

async function sendReminder(
  tenantId: string,
  reminder: Reminder,
  now: Date = new Date()
): Promise<SendOutcome> {
  // The message text is decided by the tenant's own copy, never by the model.
  const text = String(reminder.payload?.text ?? "").trim();
  if (!text) {
    await markReminder(tenantId, reminder.reminderId, {
      status: "cancelled",
      lastError: "empty_message",
    });
    return { sent: false, reason: "empty_message" };
  }

  // Consent + opt-out + window + quiet hours + caps.
  const customerId = reminder.customerId;
  const customerSnap = customerId
    ? await tenantDoc(tenantId, "customers", customerId).get()
    : null;
  const customer = customerSnap?.data() as
    | { reminderConsent?: boolean; optedOut?: boolean }
    | undefined;

  const lastInboundAt = (reminder.payload?.lastInboundAt as string) ?? null;

  const decision = await checkMessagingPolicy({
    tenantId,
    customerId,
    channel: reminder.channel,
    lastInboundAt: lastInboundAt ? new Date(lastInboundAt) : null,
    consent: customer?.reminderConsent === true,
    optedOut: customer?.optedOut === true,
    idempotencyKey: reminder.idempotencyKey,
    now,
  });

  if (!decision.allowed) {
    // Retry later when the policy allows it, otherwise suppress for good.
    const retryable =
      decision.reason === "outside_service_window" ||
      decision.reason === "quiet_hours" ||
      decision.reason === "daily_cap_reached";
    await markReminder(tenantId, reminder.reminderId, {
      status: retryable ? "scheduled" : "suppressed",
      lastError: decision.reason,
      ...(retryable
        ? { scheduledAt: decision.retryAfter ?? new Date(now.getTime() + 30 * 60_000) }
        : {}),
    });
    return { sent: false, reason: decision.reason };
  }

  // Send on the channel the reminder belongs to.
  try {
    const recipient = String(reminder.payload?.recipient ?? "");
    if (!recipient) {
      await markReminder(tenantId, reminder.reminderId, {
        status: "suppressed",
        lastError: "missing_recipient",
      });
      return { sent: false, reason: "missing_recipient" };
    }

    if (reminder.channel === "whatsapp_qr") {
      const token =
        (await getTenantApiKey(tenantId, "qr_provider"))?.key ??
        process.env.QR_PROVIDER_API_KEY?.trim();
      if (!token) throw new Error("no_provider_token");
      await sendQrText(token, recipient, text);
    } else if (reminder.channel === "whatsapp_meta") {
      const token =
        (await getTenantApiKey(tenantId, "meta_whatsapp"))?.key ??
        process.env.WHATSAPP_ACCESS_TOKEN?.trim();
      const phoneNumberId = String(reminder.payload?.phoneNumberId ?? "");
      if (!token || !phoneNumberId) throw new Error("no_meta_credentials");
      await sendMetaText({
        accessToken: token,
        phoneNumberId,
        to: recipient,
        text,
      });
    } else {
      // Web channel has no proactive push transport.
      await markReminder(tenantId, reminder.reminderId, {
        status: "suppressed",
        lastError: "channel_not_supported",
      });
      return { sent: false, reason: "channel_not_supported" };
    }

    await recordSentMessage({
      tenantId,
      idempotencyKey: reminder.idempotencyKey,
      customerId,
      reminderId: reminder.reminderId,
      channel: reminder.channel,
    });
    await markReminder(tenantId, reminder.reminderId, {
      status: "sent",
      sentAt: new Date(),
      lastError: null,
      attempts: reminder.attempts + 1,
    });
    return { sent: true, reason: "sent" };
  } catch (error: unknown) {
    await markReminder(tenantId, reminder.reminderId, {
      status: "failed",
      lastError:
        error instanceof Error ? error.message.slice(0, 200) : "send_failed",
      attempts: reminder.attempts + 1,
    });
    return { sent: false, reason: "failed" };
  }
}

/**
 * Detects carts that were never confirmed and (with consent) schedules a
 * single follow-up reminder. Carts that were already ordered are skipped.
 */
export async function detectAbandonedCarts(
  tenantId: string,
  now = new Date(),
  minutesIdle = 45
): Promise<{ detected: number; scheduled: number }> {
  const cutoff = new Date(now.getTime() - minutesIdle * 60_000);
  const cartsSnap = await tenantCollection(tenantId, "carts")
    .where("status", "==", "awaiting_confirmation")
    .get();

  let detected = 0;
  let scheduled = 0;

  for (const doc of cartsSnap.docs) {
    const cart = doc.data();
    const updatedAt = cart.updatedAt ? new Date(cart.updatedAt as Date) : null;
    if (!updatedAt || updatedAt > cutoff) continue;
    detected += 1;

    const customerId = (cart.attribution?.customerId as string) ?? null;
    const recipient = String(cart.customer?.phone ?? "");
    if (!customerId || !recipient) continue;

    const customerSnap = await tenantDoc(tenantId, "customers", customerId).get();
    const customer = customerSnap.data() as
      | { reminderConsent?: boolean }
      | undefined;
    if (customer?.reminderConsent !== true) continue;

    // If the cart was already submitted, never remind.
    if (cart.status === "submitted") continue;

    const totalLabel = String(cart.currentQuote?.totalLabel ?? "");
    const text = totalLabel
      ? `Assalam-o-Alaikum! Aap ka order (${totalLabel}) abhi confirm nahi hua. Complete karne ke liye jawab dein.`
      : "Assalam-o-Alaikum! Aap ka cart abhi complete nahi hua. Kya aap order complete karna chahte hain?";

    try {
      await scheduleReminder({
        tenantId,
        customerId,
        conversationId: String(cart.conversationId ?? ""),
        channel: String(cart.channel ?? "web"),
        type: "abandoned_cart",
        scheduledAt: new Date(now.getTime() + 30 * 60_000),
        consentReference: "reminder_consent_v1",
        idempotencyKey: `abandoned_${cart.cartId}_${cart.cartRevision}`,
        payload: {
          text,
          recipient,
          cartId: cart.cartId,
          cartRevision: cart.cartRevision,
          totalLabel,
        },
      });
      scheduled += 1;
    } catch (error: unknown) {
      // Duplicate reminders are ignored on purpose.
      if (
        !(error instanceof Error) ||
        !/DUPLICATE|already scheduled/i.test(error.message)
      ) {
        console.error(
          `[reminders] scope=detectAbandonedCarts tenant=${tenantId} message=${
            error instanceof Error ? error.message.slice(0, 120) : "unknown"
          }`
        );
      }
    }
  }

  return { detected, scheduled };
}
