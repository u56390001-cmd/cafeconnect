import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";

/**
 * Messaging policy router (Phase 6).
 *
 * Every outbound proactive message passes through this router. It enforces:
 * - consent (no message without it),
 * - the customer service window (Meta: 24 hours after the last inbound),
 * - tenant quiet hours,
 * - per-customer frequency caps,
 * - suppression when the customer opted out.
 */

export interface PolicySettings {
  /** Quiet hours in the tenant's local time (24h). */
  quietHoursStart: number;
  quietHoursEnd: number;
  /** Max proactive messages per customer per day. */
  dailyCap: number;
  /** Customer service window in hours (Meta default 24). */
  serviceWindowHours: number;
  timeZone: string;
}

export const DEFAULT_POLICY: PolicySettings = {
  quietHoursStart: 22,
  quietHoursEnd: 8,
  dailyCap: 2,
  serviceWindowHours: 24,
  timeZone: "Asia/Karachi",
};

export interface PolicyDecision {
  allowed: boolean;
  reason:
    | "allowed"
    | "no_consent"
    | "opted_out"
    | "outside_service_window"
    | "quiet_hours"
    | "daily_cap_reached"
    | "duplicate";
  /** True when a template is required (outside the service window). */
  useTemplate: boolean;
  /** Earliest time a blocked message may be sent. */
  retryAfter: Date | null;
}

function localHour(date: Date, timeZone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone,
    });
    return Number(formatter.format(date));
  } catch {
    return date.getUTCHours();
  }
}

export async function loadPolicySettings(
  tenantId: string
): Promise<PolicySettings> {
  const snap = await tenantDoc(tenantId, "settings", "messaging").get();
  const data = snap.data() ?? {};
  return {
    quietHoursStart: Number(
      data.quietHoursStart ?? DEFAULT_POLICY.quietHoursStart
    ),
    quietHoursEnd: Number(data.quietHoursEnd ?? DEFAULT_POLICY.quietHoursEnd),
    dailyCap: Number(data.dailyCap ?? DEFAULT_POLICY.dailyCap),
    serviceWindowHours: Number(
      data.serviceWindowHours ?? DEFAULT_POLICY.serviceWindowHours
    ),
    timeZone: String(data.timeZone ?? DEFAULT_POLICY.timeZone),
  };
}

/**
 * Decides whether a proactive message may be sent right now.
 */
export async function checkMessagingPolicy(input: {
  tenantId: string;
  customerId: string | null;
  channel: string;
  /** Last inbound message time from the customer (if any). */
  lastInboundAt: Date | null;
  /** Has the customer agreed to proactive messages? */
  consent: boolean;
  optedOut: boolean;
  /** Idempotency key of this specific message. */
  idempotencyKey: string;
  now?: Date;
}): Promise<PolicyDecision> {
  const now = input.now ?? new Date();
  const settings = await loadPolicySettings(input.tenantId);

  if (input.optedOut) {
    return {
      allowed: false,
      reason: "opted_out",
      useTemplate: false,
      retryAfter: null,
    };
  }
  if (!input.consent) {
    return {
      allowed: false,
      reason: "no_consent",
      useTemplate: false,
      retryAfter: null,
    };
  }

  // Duplicate suppression on the message itself.
  const sentSnap = await tenantCollection(input.tenantId, "sentMessages")
    .doc(input.idempotencyKey)
    .get();
  if (sentSnap.exists) {
    return {
      allowed: false,
      reason: "duplicate",
      useTemplate: false,
      retryAfter: null,
    };
  }

  // Service window (Meta: 24h after the last inbound message).
  const windowMs = settings.serviceWindowHours * 60 * 60 * 1000;
  const insideWindow =
    input.lastInboundAt !== null &&
    now.getTime() - new Date(input.lastInboundAt).getTime() <= windowMs;

  // Quiet hours.
  const hour = localHour(now, settings.timeZone);
  const inQuietHours =
    settings.quietHoursStart > settings.quietHoursEnd
      ? hour >= settings.quietHoursStart || hour < settings.quietHoursEnd
      : hour >= settings.quietHoursStart && hour < settings.quietHoursEnd;

  // Daily cap.
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const todaySnap = await tenantCollection(input.tenantId, "sentMessages")
    .where("sentAt", ">=", dayStart)
    .get();
  const sentToday = todaySnap.docs.filter(
    (doc) => doc.data().customerId === input.customerId
  ).length;

  if (sentToday >= settings.dailyCap) {
    return {
      allowed: false,
      reason: "daily_cap_reached",
      useTemplate: !insideWindow,
      retryAfter: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  if (!insideWindow) {
    return {
      allowed: false,
      reason: "outside_service_window",
      useTemplate: true,
      retryAfter: input.lastInboundAt
        ? new Date(
            new Date(input.lastInboundAt).getTime() + windowMs
          )
        : null,
    };
  }

  if (inQuietHours) {
    const retryAfter = new Date(now);
    retryAfter.setHours(settings.quietHoursEnd, 0, 0, 0);
    return {
      allowed: false,
      reason: "quiet_hours",
      useTemplate: false,
      retryAfter,
    };
  }

  return { allowed: true, reason: "allowed", useTemplate: false, retryAfter: null };
}

/** Records that a proactive message was sent (duplicate protection). */
export async function recordSentMessage(input: {
  tenantId: string;
  idempotencyKey: string;
  customerId: string | null;
  reminderId: string | null;
  channel: string;
}): Promise<void> {
  await tenantCollection(input.tenantId, "sentMessages")
    .doc(input.idempotencyKey.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 100))
    .set(
      {
        customerId: input.customerId,
        reminderId: input.reminderId,
        channel: input.channel,
        sentAt: new Date(),
      },
      { merge: true }
    );
}
