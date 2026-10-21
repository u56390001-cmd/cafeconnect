import { createHash } from "crypto";
import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";

/**
 * Customer identity (Phase 3 of the blueprint).
 *
 * Rules:
 * - Memory is tenant-scoped. A customer id is never shared between tenants.
 * - The durable identity is NOT the IP address. The web widget supplies a
 *   first-party random visitor id; WhatsApp supplies the verified sender
 *   number. Both are hashed before they are used as document ids, so no raw
 *   personal data ends up in document paths or logs.
 * - Linking a web identity to a WhatsApp identity is only possible through an
 *   explicit, verified flow (not implemented yet).
 */

export type IdentityChannel = "web" | "whatsapp_qr" | "whatsapp_meta";

export interface CustomerProfile {
  customerId: string;
  tenantId: string;
  displayName: string | null;
  preferredName: string | null;
  preferredLanguage: string | null;
  preferredScript: string | null;
  preferredFulfilment: "delivery" | "pickup" | null;
  consentStatus: "granted" | "declined" | "unknown";
  memoryEnabled: boolean;
  lastSeenAt: Date | null;
  lastOrderAt: Date | null;
  orderCount: number;
  profileVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/**
 * Normalises a channel identifier before hashing:
 * - WhatsApp numbers keep digits only (formatting differences collapse),
 * - web visitor ids keep their characters (they are random, not numeric).
 */
export function normalizeIdentifier(
  channel: IdentityChannel,
  identifier: string
): string {
  const trimmed = identifier.trim().toLowerCase();
  if (channel === "web") {
    return trimmed.replace(/[^a-z0-9_-]/g, "");
  }
  return trimmed.replace(/\D/g, "");
}

/** Document key for a channel identity (hashed, no raw PII). */
export function identityKey(
  channel: IdentityChannel,
  identifier: string
): string {
  return `${channel}_${hashIdentifier(normalizeIdentifier(channel, identifier)).slice(
    0,
    32
  )}`;
}

/** Deterministic, tenant-scoped customer id. */
export function customerIdFor(
  tenantId: string,
  channel: IdentityChannel,
  identifier: string
): string {
  const hash = createHash("sha256")
    .update(`${tenantId}:${identityKey(channel, identifier)}`)
    .digest("hex")
    .slice(0, 24);
  return `cust_${hash}`;
}

export interface ResolvedIdentity {
  customerId: string;
  identityKey: string;
  channel: IdentityChannel;
  profile: CustomerProfile;
  isNew: boolean;
}

const EMPTY_PROFILE = (
  tenantId: string,
  customerId: string
): CustomerProfile => ({
  customerId,
  tenantId,
  displayName: null,
  preferredName: null,
  preferredLanguage: null,
  preferredScript: null,
  preferredFulfilment: null,
  consentStatus: "unknown",
  memoryEnabled: true,
  lastSeenAt: null,
  lastOrderAt: null,
  orderCount: 0,
  profileVersion: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
});

/**
 * Resolves (or creates) the tenant-scoped customer for a channel identity.
 * `identifier` is a verified WhatsApp number or a first-party web visitor id.
 */
export async function resolveCustomer(input: {
  tenantId: string;
  channel: IdentityChannel;
  identifier: string;
  displayName?: string | null;
}): Promise<ResolvedIdentity> {
  const { tenantId, channel, identifier } = input;
  const key = identityKey(channel, identifier);
  const customerId = customerIdFor(tenantId, channel, identifier);

  const mappingRef = tenantDoc(tenantId, "customerIdentities", key);
  const mappingSnap = await mappingRef.get();
  const mappedCustomerId = mappingSnap.exists
    ? (mappingSnap.data()?.customerId as string | undefined)
    : undefined;

  const profileRef = tenantDoc(tenantId, "customers", customerId);
  const profileSnap = await profileRef.get();
  const now = new Date();

  if (!mappingSnap.exists) {
    await mappingRef.set(
      {
        customerId,
        tenantId,
        channel,
        identityHash: hashIdentifier(identifier).slice(0, 32),
        verifiedAt: channel === "web" ? null : now,
        createdAt: now,
        lastSeenAt: now,
      },
      { merge: true }
    );
  } else {
    await mappingRef.set({ lastSeenAt: now }, { merge: true });
  }

  if (!profileSnap.exists) {
    const profile = {
      ...EMPTY_PROFILE(tenantId, customerId),
      displayName: input.displayName ?? null,
    };
    await profileRef.set(profile, { merge: true });
    return {
      customerId,
      identityKey: key,
      channel,
      profile: profile as CustomerProfile,
      isNew: true,
    };
  }

  const profile = {
    ...(profileSnap.data() as CustomerProfile),
    lastSeenAt: now,
  };
  await profileRef.set({ lastSeenAt: now }, { merge: true });

  return {
    customerId: mappedCustomerId ?? customerId,
    identityKey: key,
    channel,
    profile,
    isNew: false,
  };
}

/** Lists the tenant's customers (staff view). */
export async function listCustomers(
  tenantId: string,
  limit = 100
): Promise<CustomerProfile[]> {
  const snap = await tenantCollection(tenantId, "customers").limit(limit).get();
  return snap.docs
    .map((doc) => doc.data() as CustomerProfile)
    .sort(
      (a, b) =>
        new Date(b.lastSeenAt ?? b.createdAt).getTime() -
        new Date(a.lastSeenAt ?? a.createdAt).getTime()
    );
}
