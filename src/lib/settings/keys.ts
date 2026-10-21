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
  const snapshot = await db
    .collection(`tenants/${tenantId}/apiKeys`)
    .where("provider", "==", provider)
    .where("status", "in", ["active", "pending_validation"])
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
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
