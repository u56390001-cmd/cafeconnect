import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";

/**
 * Durable reminder scheduler (Phase 6 of the blueprint).
 *
 * Reminders are records with a due time, consent reference, idempotency key
 * and status - never "the model remembers to message later".
 *
 * Suppression rules:
 * - no reminder without consent,
 * - duplicate idempotency keys are ignored,
 * - a reminder whose cart was already ordered is cancelled,
 * - the messaging policy router may block a send (window, quiet hours, caps).
 */

export type ReminderType = "abandoned_cart" | "booking_follow_up";
export type ReminderStatus =
  | "scheduled"
  | "sending"
  | "sent"
  | "cancelled"
  | "failed"
  | "suppressed";

export const REMINDER_TYPES: ReminderType[] = ["abandoned_cart", "booking_follow_up"];

export interface Reminder {
  reminderId: string;
  tenantId: string;
  customerId: string | null;
  conversationId: string | null;
  channel: string;
  type: ReminderType;
  scheduledAt: Date;
  status: ReminderStatus;
  consentReference: string | null;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  cancelledAt: Date | null;
}

export class ReminderError extends Error {
  readonly code:
    | "NO_CONSENT"
    | "INVALID_TYPE"
    | "INVALID_SCHEDULE"
    | "CART_ALREADY_ORDERED"
    | "DUPLICATE";

  constructor(code: ReminderError["code"], message: string) {
    super(message);
    this.name = "ReminderError";
    this.code = code;
  }
}

export async function scheduleReminder(input: {
  tenantId: string;
  customerId: string | null;
  conversationId: string | null;
  channel: string;
  type: ReminderType;
  scheduledAt: Date;
  consentReference: string | null;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
}): Promise<Reminder> {
  if (!REMINDER_TYPES.includes(input.type)) {
    throw new ReminderError("INVALID_TYPE", "Unsupported reminder type");
  }
  if (!input.consentReference) {
    throw new ReminderError("NO_CONSENT", "Reminder requires customer consent");
  }
  if (
    Number.isNaN(input.scheduledAt.getTime()) ||
    input.scheduledAt.getTime() <= Date.now()
  ) {
    throw new ReminderError("INVALID_SCHEDULE", "Invalid reminder time");
  }

  const reminderId = `rem_${input.idempotencyKey}`.replace(
    /[^A-Za-z0-9_-]/g,
    ""
  ).slice(0, 100);
  const ref = tenantCollection(input.tenantId, "reminders").doc(reminderId);
  const existing = await ref.get();
  if (existing.exists) {
    // Duplicate: keep the first record, never schedule twice.
    throw new ReminderError("DUPLICATE", "Reminder already scheduled");
  }

  const now = new Date();
  const reminder: Reminder = {
    reminderId,
    tenantId: input.tenantId,
    customerId: input.customerId,
    conversationId: input.conversationId,
    channel: input.channel,
    type: input.type,
    scheduledAt: input.scheduledAt,
    status: "scheduled",
    consentReference: input.consentReference,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload ?? {},
    attempts: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    cancelledAt: null,
  };

  await ref.set(reminder, { merge: true });
  return reminder;
}

export async function cancelReminder(
  tenantId: string,
  reminderId: string,
  reason: string
): Promise<void> {
  await tenantDoc(tenantId, "reminders", reminderId).set(
    {
      status: "cancelled",
      lastError: reason.slice(0, 200),
      cancelledAt: new Date(),
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

/** Lists reminders that are due (and not yet handled). */
export async function dueReminders(
  tenantId: string,
  now = new Date(),
  limit = 20
): Promise<Reminder[]> {
  const snap = await tenantCollection(tenantId, "reminders")
    .where("status", "==", "scheduled")
    .limit(100)
    .get();

  return snap.docs
    .map((doc) => doc.data() as Reminder)
    .filter(
      (reminder) =>
        new Date(reminder.scheduledAt).getTime() <= now.getTime()
    )
    .slice(0, limit);
}

export async function markReminder(
  tenantId: string,
  reminderId: string,
  update: Partial<Reminder>
): Promise<void> {
  await tenantDoc(tenantId, "reminders", reminderId).set(
    { ...update, updatedAt: new Date() },
    { merge: true }
  );
}

/** Lists reminders for a customer (staff view). */
export async function listReminders(
  tenantId: string,
  limit = 100
): Promise<Reminder[]> {
  const snap = await tenantCollection(tenantId, "reminders").limit(limit).get();
  return snap.docs
    .map((doc) => doc.data() as Reminder)
    .sort(
      (a, b) =>
        new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
    );
}
