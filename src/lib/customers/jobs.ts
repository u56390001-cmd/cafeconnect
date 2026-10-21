import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";
import { saveMemory, listMemories, type MemoryType } from "./memory";
import type { CustomerProfile } from "./identity";

/**
 * Durable memory jobs (Phase 3).
 *
 * Memory extraction never happens inside the customer-facing turn. A job record
 * is written, the reply goes out, and the job is processed in the background
 * (and retried by the cron worker if the background run was interrupted).
 * If memory processing fails, the customer turn is unaffected.
 */

export type MemoryJobStatus = "pending" | "processing" | "completed" | "failed";

export interface MemoryJob {
  jobId: string;
  tenantId: string;
  customerId: string;
  conversationId: string;
  channel: string;
  status: MemoryJobStatus;
  attempts: number;
  nextAttemptAt: Date | null;
  idempotencyKey: string;
  createdAt: Date;
  lastErrorCode: string | null;
}

const MAX_ATTEMPTS = 3;

export async function enqueueMemoryJob(input: {
  tenantId: string;
  customerId: string;
  conversationId: string;
  channel: string;
  customerMessage: string;
  assistantMessage: string;
}): Promise<string | null> {
  const idempotencyKey = `mem_${input.customerId}_${input.conversationId}_${Date.now()
    .toString(36)
    .slice(-6)}`;

  const jobId = `job_${idempotencyKey}`;
  await tenantCollection(input.tenantId, "memoryJobs").doc(jobId).set(
    {
      jobId,
      tenantId: input.tenantId,
      customerId: input.customerId,
      conversationId: input.conversationId,
      channel: input.channel,
      status: "pending" as MemoryJobStatus,
      attempts: 0,
      nextAttemptAt: new Date(),
      idempotencyKey,
      customerMessage: input.customerMessage.slice(0, 1000),
      assistantMessage: input.assistantMessage.slice(0, 1000),
      createdAt: new Date(),
      lastErrorCode: null,
    },
    { merge: true }
  );

  return jobId;
}

export async function processMemoryJob(
  tenantId: string,
  jobId: string
): Promise<{ ok: boolean; saved: string[] }> {
  const ref = tenantCollection(tenantId, "memoryJobs").doc(jobId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, saved: [] };
  const job = snap.data() as MemoryJob & {
    customerMessage?: string;
    assistantMessage?: string;
  };

  if (job.status === "completed") {
    return { ok: true, saved: [] };
  }
  if ((job.attempts ?? 0) >= MAX_ATTEMPTS) {
    return { ok: false, saved: [] };
  }

  await ref.set(
    { status: "processing", attempts: (job.attempts ?? 0) + 1 },
    { merge: true }
  );

  try {
    const saved = await extractAndSave(tenantId, job);

    await ref.set(
      { status: "completed", lastErrorCode: null, nextAttemptAt: null },
      { merge: true }
    );
    return { ok: true, saved };
  } catch (error: unknown) {
    const code =
      error instanceof Error ? error.message.slice(0, 120) : "unknown_error";
    await ref.set(
      {
        status: "failed",
        lastErrorCode: code,
        nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000),
      },
      { merge: true }
    );
    return { ok: false, saved: [] };
  }
}

/** Processes pending jobs for a tenant (used by the cron worker). */
export async function processPendingMemoryJobs(
  tenantId: string,
  limit = 20
): Promise<{ processed: number; saved: number }> {
  const snap = await tenantCollection(tenantId, "memoryJobs")
    .where("status", "in", ["pending", "failed"])
    .limit(limit)
    .get();

  let processed = 0;
  let saved = 0;
  for (const doc of snap.docs) {
    const result = await processMemoryJob(tenantId, doc.id);
    processed += 1;
    saved += result.saved.length;
  }
  return { processed, saved };
}

/**
 * Deterministic extraction of the facts we are allowed to remember.
 * Model-based extraction can be added later behind the same job contract.
 */
async function extractAndSave(
  tenantId: string,
  job: MemoryJob & { customerMessage?: string; assistantMessage?: string }
): Promise<string[]> {
  const message = job.customerMessage ?? "";
  const saved: string[] = [];

  const profileRef = tenantDoc(tenantId, "customers", job.customerId);
  const profileSnap = await profileRef.get();
  const profile = profileSnap.data() as CustomerProfile | undefined;
  if (!profile || profile.memoryEnabled === false) {
    return saved;
  }
  if (profile.consentStatus === "declined") {
    return saved;
  }

  // 1) Consent withdrawal: "stop remembering me", "don't save my number".
  if (
    /\b(stop remembering|don'?t remember|do not remember|forget me|delete my (data|details|memory)|meri (yaad|information) (delete|hatkao)|privacy)\b/i.test(
      message
    )
  ) {
    await profileRef.set(
      { memoryEnabled: false, consentStatus: "declined", updatedAt: new Date() },
      { merge: true }
    );
    return saved;
  }

  // 2) Preferred name: "my name is X", "mera naam X hai", "I'm X".
  const nameMatch = message.match(
    /\b(?:my name is|this is|i am|i'm|mera naam|mera name|name is)\s+([A-Za-z][A-Za-z .'-]{1,40})/i
  );
  if (nameMatch) {
    const name = nameMatch[1].trim().replace(/\b(is|hai|please|and|aur)\b.*$/i, "").trim();
    if (name && name.length >= 2) {
      const memory = await saveMemory({
        tenantId,
        customerId: job.customerId,
        type: "preference",
        key: "preferred_name",
        value: name,
        sourceType: "explicit",
        confidence: 0.9,
        consentBasis: "explicit_request",
      });
      if (memory) {
        await profileRef.set(
          { preferredName: name, updatedAt: new Date() },
          { merge: true }
        );
        saved.push("preferred_name");
      }
    }
  }

  // 3) Language preference: "reply in Roman Urdu / Urdu / English".
  const hasReplyIntent =
    /\b(reply|respond|answer|baat|bola|jawab|reply karein|batao)\b/i.test(message) ||
    /\b(mein|me|ko)\b[^\n]{0,20}\b(jawab|baat|reply)\b/i.test(message);

  let languageValue: string | null = null;
  if (/roman\s*urdu/i.test(message)) {
    languageValue = "ur-Latn-PK";
  } else if (/urdu\s*script|اردو\s*کریپٹ/i.test(message)) {
    languageValue = "ur-PK";
  } else if (/\benglish\b/i.test(message) && hasReplyIntent) {
    languageValue = "en-PK";
  } else if (/\burdu\b/i.test(message) && hasReplyIntent) {
    languageValue = "ur-PK";
  }

  if (languageValue) {
    const memory = await saveMemory({
      tenantId,
      customerId: job.customerId,
      type: "preference",
      key: "preferred_language",
      value: languageValue,
      sourceType: "explicit",
      confidence: 0.9,
      consentBasis: "explicit_request",
    });
    if (memory) {
      await profileRef.set(
        { preferredLanguage: languageValue, updatedAt: new Date() },
        { merge: true }
      );
      saved.push("preferred_language");
    }
  }

  // 4) Fulfilment preference: "always delivery", "no delivery, pickup only".
  const fulfilmentMatch = message.match(
    /\b(always delivery|only pickup|pickup only|no delivery|delivery only|hamesha delivery|sirf pickup)\b/i
  );
  if (fulfilmentMatch) {
    const value = /pickup/i.test(fulfilmentMatch[1]) ? "pickup" : "delivery";
    const memory = await saveMemory({
      tenantId,
      customerId: job.customerId,
      type: "preference",
      key: "preferred_fulfilment",
      value,
      sourceType: "explicit",
      confidence: 0.85,
      consentBasis: "explicit_request",
    });
    if (memory) {
      await profileRef.set(
        { preferredFulfilment: value, updatedAt: new Date() },
        { merge: true }
      );
      saved.push("preferred_fulfilment");
    }
  }

  // 5) Order-derived summary from completed orders.
  const completed = await tenantCollection(tenantId, "orders")
    .where("status", "==", "completed")
    .get();
  const mine = completed.docs.filter(
    (doc) => doc.data()?.customer?.phone === undefined
  );
  if (mine.length > 0) {
    const items = mine.flatMap((doc) =>
      ((doc.data()?.items ?? []) as Array<{ name?: string }>).map(
        (item) => item.name ?? ""
      )
    );
    const counts = new Map<string, number>();
    for (const name of items) {
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name} x${count}`);
    if (top.length > 0) {
      const memory = await saveMemory({
        tenantId,
        customerId: job.customerId,
        type: "behavior_summary",
        key: "last_order_summary",
        value: `Often orders: ${top.join(", ")}`,
        sourceType: "order_derived",
        confidence: 0.7,
        consentBasis: "service_improvement",
      });
      if (memory) saved.push("last_order_summary");
    }
  }

  return saved;
}

/** Summarises what we remember about a customer (staff view). */
export async function customerMemorySummary(
  tenantId: string,
  customerId: string
): Promise<Array<{ key: string; value: string; type: MemoryType; source: string }>> {
  const memories = await listMemories(tenantId, customerId);
  return memories.map((memory) => ({
    key: memory.key,
    value: memory.value,
    type: memory.type,
    source: memory.sourceType,
  }));
}
