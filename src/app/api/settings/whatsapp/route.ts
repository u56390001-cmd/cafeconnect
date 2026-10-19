import { adminDb } from "@/lib/firebase/admin";
import { requireTenantScope, tenantDoc } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError } from "@/lib/api/response";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type WhatsappMode = "meta" | "qr_trial";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { tenantId, userId, role, mode } = await request.json();

    if (!tenantId || !userId || !mode) {
      return createApiError("Missing required fields", 400);
    }

    if (mode !== "meta" && mode !== "qr_trial") {
      return createApiError("Invalid WhatsApp mode", 400);
    }

    const ctx = await requireTenantScope(tenantId, userId, role || "owner");

    const provider =
      mode === "meta" ? "meta_whatsapp" : "qr_provider";

    const existing = await adminDb
      .collection(`tenants/${ctx.tenantId}/apiKeys`)
      .where("provider", "==", provider)
      .limit(1)
      .get();

    if (!existing.empty) {
      await existing.docs[0].ref.update({
        status: "active",
        updatedAt: new Date(),
      });
    }

    await tenantDoc(ctx.tenantId, "settings", "whatsapp").set(
      {
        tenantId: ctx.tenantId,
        mode,
        provider,
        status: existing.empty ? "not_configured" : "active",
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return createApiResponse({
      mode,
      provider,
      status: existing.empty ? "not_configured" : "active",
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

    const snap = await tenantDoc(
      ctx.tenantId,
      "settings",
      "whatsapp"
    ).get();

    const data = snap.exists ? snap.data() : null;

    return createApiResponse({
      mode: data?.mode ?? null,
      provider: data?.provider ?? null,
      status: data?.status ?? "not_configured",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return createApiError(message, 500);
  }
}
