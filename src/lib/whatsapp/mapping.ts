import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Trusted server-side mapping between provider identifiers and tenants.
 * Never accept tenant ids from inbound webhooks.
 */

export async function mapMetaPhoneNumberId(
  phoneNumberId: string,
  tenantId: string
): Promise<void> {
  if (!phoneNumberId) return;
  await getAdminDb()
    .collection("metaPhoneNumbers")
    .doc(phoneNumberId)
    .set(
      {
        phoneNumberId,
        tenantId,
        provider: "meta_whatsapp",
        updatedAt: new Date(),
      },
      { merge: true }
    );
}

export async function resolveTenantByMetaPhoneNumberId(
  phoneNumberId: string
): Promise<string | null> {
  if (!phoneNumberId) return null;
  const snap = await getAdminDb()
    .collection("metaPhoneNumbers")
    .doc(phoneNumberId)
    .get();
  if (!snap.exists) return null;
  return (snap.data()?.tenantId as string) ?? null;
}
