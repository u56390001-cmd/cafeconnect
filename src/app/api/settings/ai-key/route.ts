import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireTenantScope, tenantDoc } from "@/lib/tenancy/resolver";
import { encrypt, maskHint } from "@/lib/security/encryption";
import { createApiResponse, createApiError } from "@/lib/api/response";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { tenantId, userId, role, provider, keyValue } = await request.json();

    if (!tenantId || !userId || !provider || !keyValue) {
      return createApiError("Missing required fields", 400);
    }

    const ctx = await requireTenantScope(tenantId, userId, role || "readOnly");

    const encryptionKey = process.env.SECRET_ENCRYPTION_KEY;
    if (!encryptionKey) {
      return createApiError("Encryption key not configured", 500);
    }

    const encrypted = await encrypt(keyValue, encryptionKey, 1);
    const masked = maskHint(keyValue);

    const keyRef = tenantDoc(ctx.tenantId, "apiKeys", "key-" + Date.now().toString(36));
    await keyRef.set({
      keyId: keyRef.id,
      tenantId: ctx.tenantId,
      provider: provider as "gemini" | "meta_whatsapp" | "qr_provider",
      credentialType: "api_key",
      ciphertext: encrypted.ciphertext,
      nonceOrIv: encrypted.nonceOrIv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      maskedHint: masked,
      status: "pending_validation",
      lastValidatedAt: null,
      createdBy: ctx.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return createApiResponse({
      keyId: keyRef.id,
      maskedHint: masked,
      status: "pending_validation",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return createApiError(message, 500);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const userId = searchParams.get("userId");
    const role = searchParams.get("role") || "readOnly";

    if (!tenantId || !userId) {
      return createApiError("Missing tenant or user", 400);
    }

    const ctx = await requireTenantScope(tenantId, userId, role);

    const snap = await adminDb
      .collection(`tenants/${ctx.tenantId}/apiKeys`)
      .where("status", "==", "active")
      .get();

    const keys = snap.docs.map((doc) => {
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
    });

    return createApiResponse({ keys });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return createApiError(message, 500);
  }
}
