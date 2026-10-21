import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";
import type { CustomerProfile } from "./identity";

export type { CustomerProfile };

/**
 * Customer memory (Phase 3 of the blueprint).
 *
 * Memory is tenant-scoped and only contains facts that are useful for future
 * service: a preferred name, a language/script preference, a fulfilment
 * preference, and order-derived summaries of completed orders.
 *
 * Rules enforced here:
 * - every fact has a source, a confidence and an expiry;
 * - a correction supersedes a conflicting fact (the old one is marked stale);
 * - consent can be withdrawn, and withdrawn/disabled memory is never returned
 *   to the model;
 * - no sensitive traits (allergies, health, religion, politics) are stored.
 */

export type MemoryType = "preference" | "explicit_fact" | "behavior_summary";
export type MemorySource = "explicit" | "order_derived" | "inferred";
export type MemoryStatus = "active" | "stale" | "deleted";

export interface CustomerMemory {
  memoryId: string;
  customerId: string;
  tenantId: string;
  type: MemoryType;
  key: string;
  value: string;
  sourceType: MemorySource;
  confidence: number;
  evidenceMessageId: string | null;
  evidenceOrderId: string | null;
  firstObservedAt: Date;
  lastConfirmedAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  consentBasis: string | null;
  status: MemoryStatus;
}

export const MEMORY_TTL_DAYS = 180;

/** Keys we are allowed to remember. Anything else is ignored. */
export const ALLOWED_MEMORY_KEYS = [
  "preferred_name",
  "preferred_language",
  "preferred_script",
  "preferred_fulfilment",
  "last_order_summary",
  "favourite_items",
] as const;

export type AllowedMemoryKey = (typeof ALLOWED_MEMORY_KEYS)[number];

export async function listMemories(
  tenantId: string,
  customerId: string
): Promise<CustomerMemory[]> {
  const snap = await tenantCollection(tenantId, "customers")
    .doc(customerId)
    .collection("memories")
    .where("status", "==", "active")
    .get();

  const now = Date.now();
  return snap.docs
    .map((doc) => doc.data() as CustomerMemory)
    .filter((memory) => !memory.expiresAt || new Date(memory.expiresAt).getTime() > now);
}

/**
 * Saves a fact. A new fact with the same key supersedes the old one (the old
 * one is marked stale) so a correction always wins.
 */
export async function saveMemory(input: {
  tenantId: string;
  customerId: string;
  type: MemoryType;
  key: string;
  value: string;
  sourceType: MemorySource;
  confidence?: number;
  evidenceMessageId?: string | null;
  evidenceOrderId?: string | null;
  ttlDays?: number;
  consentBasis?: string | null;
}): Promise<CustomerMemory | null> {
  if (!ALLOWED_MEMORY_KEYS.includes(input.key as AllowedMemoryKey)) {
    return null;
  }
  if (typeof input.value !== "string" || !input.value.trim()) {
    return null;
  }

  const now = new Date();
  const memoriesRef = tenantCollection(input.tenantId, "customers")
    .doc(input.customerId)
    .collection("memories");

  // Supersede a conflicting fact with the same key.
  const existing = await memoriesRef
    .where("key", "==", input.key)
    .where("status", "==", "active")
    .get();
  for (const doc of existing.docs) {
    await doc.ref.set({ status: "stale", updatedAt: now }, { merge: true });
  }

  const memoryId = `mem_${input.key}_${Date.now().toString(36)}`;
  const memory: CustomerMemory = {
    memoryId,
    customerId: input.customerId,
    tenantId: input.tenantId,
    type: input.type,
    key: input.key,
    value: input.value.trim().slice(0, 300),
    sourceType: input.sourceType,
    confidence: input.confidence ?? (input.sourceType === "explicit" ? 1 : 0.6),
    evidenceMessageId: input.evidenceMessageId ?? null,
    evidenceOrderId: input.evidenceOrderId ?? null,
    firstObservedAt: now,
    lastConfirmedAt: now,
    updatedAt: now,
    expiresAt: new Date(
      now.getTime() + (input.ttlDays ?? MEMORY_TTL_DAYS) * 24 * 60 * 60 * 1000
    ),
    consentBasis: input.consentBasis ?? "service_improvement",
    status: "active",
  };

  await memoriesRef.doc(memoryId).set(memory, { merge: true });
  return memory;
}

/** Removes a fact (customer request or staff action). */
export async function deleteMemory(
  tenantId: string,
  customerId: string,
  key: string
): Promise<number> {
  const snap = await tenantCollection(tenantId, "customers")
    .doc(customerId)
    .collection("memories")
    .where("key", "==", key)
    .get();

  let removed = 0;
  for (const doc of snap.docs) {
    await doc.ref.set({ status: "deleted", updatedAt: new Date() }, { merge: true });
    removed += 1;
  }
  return removed;
}

/** Withdraws consent and disables memory for a customer. */
export async function disableMemory(
  tenantId: string,
  customerId: string
): Promise<void> {
  await tenantDoc(tenantId, "customers", customerId).set(
    {
      memoryEnabled: false,
      consentStatus: "declined",
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

/** Re-enables memory (customer or staff action). */
export async function enableMemory(
  tenantId: string,
  customerId: string
): Promise<void> {
  await tenantDoc(tenantId, "customers", customerId).set(
    {
      memoryEnabled: true,
      consentStatus: "granted",
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

export function memoryEnabled(profile: CustomerProfile | null): boolean {
  if (!profile) return false;
  if (profile.memoryEnabled === false) return false;
  if (profile.consentStatus === "declined") return false;
  return true;
}

/**
 * Renders the memory layer for the prompt. Only verified, non-expired facts
 * are included, and no identifiers are exposed.
 */
export function renderMemoryBlock(
  profile: CustomerProfile | null,
  memories: CustomerMemory[]
): string {
  if (!profile || !memoryEnabled(profile)) {
    return "(no memory: memory is disabled or not permitted for this customer)";
  }

  const lines: string[] = [];
  if (profile.preferredName) {
    lines.push(`Preferred name: ${profile.preferredName}`);
  }
  if (profile.preferredLanguage) {
    lines.push(`Preferred language: ${profile.preferredLanguage}`);
  }
  if (profile.preferredFulfilment) {
    lines.push(`Preferred fulfilment: ${profile.preferredFulfilment}`);
  }
  for (const memory of memories) {
    lines.push(`${memory.key}: ${memory.value}`);
  }
  if (profile.orderCount > 0) {
    lines.push(`Previous orders with this business: ${profile.orderCount}`);
  }

  if (lines.length === 0) {
    return "(no saved memory yet)";
  }

  return [
    ...lines,
    "Use the saved name and preferences naturally. Do not ask again for details that are already saved here. Never mention that you stored them.",
  ].join("\n");
}
