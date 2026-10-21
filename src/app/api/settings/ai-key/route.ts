import { getAdminDb } from "@/lib/firebase/admin";
import { requireTenantScope, tenantDoc } from "@/lib/tenancy/resolver";
import { encrypt, maskHint, decrypt } from "@/lib/security/encryption";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PROVIDERS = ["gemini", "meta_whatsapp", "qr_provider"] as const;
type Provider = (typeof PROVIDERS)[number];

async function validateGeminiKey(keyValue: string): Promise<boolean> {
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models",
    { headers: { "x-goog-api-key": keyValue } }
  );
  return response.ok;
}

async function validateQrProviderKey(keyValue: string): Promise<boolean> {
  try {
    const { getQrSession } = await import("@/lib/whatsapp/qr-provider");
    const session = await getQrSession(keyValue.trim());
    return session.status !== "error";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { tenantId, provider, keyValue } = await request.json();

    if (!tenantId || !provider || !keyValue) {
      return createApiError("Missing required fields", 400);
    }
    if (!PROVIDERS.includes(provider)) {
      return createApiError("Invalid provider", 400);
    }
    if (typeof keyValue !== "string" || keyValue.length < 8 || keyValue.length > 1000) {
      return createApiError("Invalid key format", 400);
    }

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");

    const encryptionKey = process.env.SECRET_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error(
        "Missing SECRET_ENCRYPTION_KEY - refusing to store plaintext secret"
      );
    }

    const encrypted = await encrypt(keyValue, encryptionKey, 1);
    const masked = maskHint(keyValue);

    let status: "active" | "pending_validation" = "pending_validation";
    let validationNote: string | null = null;

    if (provider === "gemini") {
      try {
        const valid = await validateGeminiKey(keyValue);
        if (valid) {
          status = "active";
        } else {
          validationNote = "Key saved but could not be validated";
        }
      } catch {
        validationNote = "Key saved; validation skipped (network issue)";
      }
    }

    if (provider === "qr_provider") {
      try {
        const valid = await validateQrProviderKey(keyValue);
        if (valid) {
          status = "active";
        } else {
          validationNote =
            "Key saved but the provider did not confirm it. You can retry from the WhatsApp card.";
        }
      } catch {
        validationNote = "Key saved; validation skipped (network issue)";
      }
    }

    const keyRef = tenantDoc(
      ctx.tenantId,
      "apiKeys",
      "key-" + Date.now().toString(36)
    );
    await keyRef.set({
      keyId: keyRef.id,
      tenantId: ctx.tenantId,
      provider: provider as Provider,
      credentialType: "api_key",
      ciphertext: encrypted.ciphertext,
      nonceOrIv: encrypted.nonceOrIv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      salt: encrypted.salt,
      maskedHint: masked,
      status,
      lastValidatedAt: status === "active" ? new Date() : null,
      createdBy: ctx.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return createApiResponse({
      keyId: keyRef.id,
      maskedHint: masked,
      status,
      validationNote,
    });
  } catch (error: unknown) {
    return handleApiError("api/settings/ai-key", error);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    const ctx = await requireTenantScope(tenantId, session.uid, "member");

    const snap = await getAdminDb()
      .collection(`tenants/${ctx.tenantId}/apiKeys`)
      .get();

    const keys = snap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          keyId: data.keyId,
          provider: data.provider,
          maskedHint: data.maskedHint,
          status: data.status,
          keyVersion: data.keyVersion,
          lastValidatedAt: data.lastValidatedAt,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt as Date).getTime() -
          new Date(a.updatedAt as Date).getTime()
      );

    return createApiResponse({ keys });
  } catch (error: unknown) {
    return handleApiError("api/settings/ai-key", error);
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const keyId = searchParams.get("keyId");
    if (!tenantId || !keyId) return createApiError("Missing tenantId or keyId", 400);

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");

    await getAdminDb()
      .collection(`tenants/${ctx.tenantId}/apiKeys`)
      .doc(keyId)
      .delete();

    return createApiResponse({ deleted: keyId });
  } catch (error: unknown) {
    return handleApiError("api/settings/ai-key", error);
  }
}
