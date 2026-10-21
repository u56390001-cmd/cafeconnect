import { getAdminDb } from "@/lib/firebase/admin";
import { decrypt } from "@/lib/security/encryption";

export interface TenantApiKey {
  keyId: string;
  provider: string;
  key: string;
}

const KEY_CACHE_TTL_MS = 60_000;
const keyCache = new Map<string, { expiresAt: number; value: TenantApiKey | null }>();

export function invalidateTenantApiKeyCache(tenantId: string): void {
  keyCache.delete(tenantId);
}

export async function getTenantApiKey(
  tenantId: string,
  provider: "gemini" | "meta_whatsapp" | "qr_provider"
): Promise<TenantApiKey | null> {
  const cacheKey = `${tenantId}:${provider}`;
  const cached = keyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await loadTenantApiKey(tenantId, provider);
  keyCache.set(cacheKey, { value, expiresAt: Date.now() + KEY_CACHE_TTL_MS });
  return value;
}

async function loadTenantApiKey(
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

  // Prefer a validated ("active") key, fall back to a pending one.
  const active = snapshot.docs.find((doc) => doc.data().status === "active");
  const usable =
    active ?? snapshot.docs.find((doc) => doc.data().status === "pending_validation");
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
