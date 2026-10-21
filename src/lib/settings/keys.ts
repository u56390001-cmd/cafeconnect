import { getAdminDb } from "@/lib/firebase/admin";
import { decrypt } from "@/lib/security/encryption";

export interface TenantApiKey {
  keyId: string;
  provider: string;
  key: string;
}

export async function getTenantApiKey(
  tenantId: string,
  provider: "gemini" | "meta_whatsapp" | "qr_provider"
): Promise<TenantApiKey | null> {
  const encryptionKey = process.env.SECRET_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error(
      "Missing SECRET_ENCRYPTION_KEY - refusing to decrypt tenant secrets"
    );
  }

  const db = getAdminDb();
  // Single-field query on purpose: a composite index on (provider, status)
  // is not guaranteed to exist on every project.
  const snapshot = await db
    .collection(`tenants/${tenantId}/apiKeys`)
    .where("provider", "==", provider)
    .limit(5)
    .get();

  if (snapshot.empty) return null;

  const usable = snapshot.docs.find((doc) => {
    const status = doc.data().status;
    return status === "active" || status === "pending_validation";
  });
  if (!usable) return null;

  const doc = usable;
  const data = doc.data();
  if (!data.ciphertext || !data.keyVersion) return null;

  const plaintext = await decrypt(
    {
      ciphertext: data.ciphertext,
      nonceOrIv: data.nonceOrIv,
      authTag: data.authTag,
      keyVersion: data.keyVersion,
      salt: data.salt,
    },
    encryptionKey
  );

  return { keyId: data.keyId, provider, key: plaintext };
}
