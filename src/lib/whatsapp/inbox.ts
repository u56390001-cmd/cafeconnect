import { getAdminDb } from "@/lib/firebase/admin";

export type InboxChannel = "whatsapp_qr" | "whatsapp_meta";

export interface InboxEvent {
  eventId: string;
  tenantId: string;
  channel: InboxChannel;
  customerReference: string;
  text: string;
  providerEvent: Record<string, unknown>;
  status: "pending" | "processing" | "sent" | "failed" | "skipped";
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  processedAt: Date | null;
}

export async function enqueueInboxEvent(event: {
  eventId: string;
  tenantId: string;
  channel: InboxChannel;
  customerReference: string;
  text: string;
  providerEvent: Record<string, unknown>;
}): Promise<void> {
  const ref = getAdminDb()
    .collection(`tenants/${event.tenantId}/whatsappInbox`)
    .doc(event.eventId);

  const existing = await ref.get();
  if (existing.exists) return;

  await ref.set({
    eventId: event.eventId,
    tenantId: event.tenantId,
    channel: event.channel,
    customerReference: event.customerReference,
    text: event.text,
    providerEvent: event.providerEvent,
    status: "pending",
    attempts: 0,
    lastError: null,
    createdAt: new Date(),
    processedAt: null,
  });
}

export async function getInboxEvent(
  tenantId: string,
  eventId: string
): Promise<InboxEvent | null> {
  const snap = await getAdminDb()
    .collection(`tenants/${tenantId}/whatsappInbox`)
    .doc(eventId)
    .get();
  if (!snap.exists) return null;
  return snap.data() as InboxEvent;
}

export async function markInboxEvent(
  tenantId: string,
  eventId: string,
  update: Partial<InboxEvent>
): Promise<void> {
  await getAdminDb()
    .collection(`tenants/${tenantId}/whatsappInbox`)
    .doc(eventId)
    .set({ ...update, processedAt: update.processedAt ?? new Date() }, { merge: true });
}

/**
 * Lists pending inbox events across tenants.
 * Uses the tenant registry (top-level "tenants" collection) so it never relies
 * on a collection-group index.
 */
export async function listPendingInboxEvents(
  limit = 20
): Promise<Array<InboxEvent & { tenantId: string }>> {
  const db = getAdminDb();
  const tenantsSnap = await db.collection("tenants").get();
  const pending: Array<InboxEvent & { tenantId: string }> = [];

  for (const tenantDoc of tenantsSnap.docs) {
    if (pending.length >= limit) break;
    const inboxSnap = await tenantDoc.ref
      .collection("whatsappInbox")
      .where("status", "==", "pending")
      .limit(Math.max(1, limit - pending.length))
      .get();

    for (const doc of inboxSnap.docs) {
      pending.push({ ...(doc.data() as InboxEvent), tenantId: tenantDoc.id });
      if (pending.length >= limit) break;
    }
  }

  return pending;
}
