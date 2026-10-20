import { requireTenantScope, tenantDoc } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

type WhatsappMode = "meta" | "qr_trial";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { tenantId, mode } = await request.json();

    if (!tenantId || !mode) {
      return createApiError("Missing required fields", 400);
    }
    if (mode !== "meta" && mode !== "qr_trial") {
      return createApiError("Invalid WhatsApp mode", 400);
    }

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");
    const provider = mode === "meta" ? "meta_whatsapp" : "qr_provider";

    const existing = await getAdminDb()
      .collection(`tenants/${ctx.tenantId}/apiKeys`)
      .where("provider", "==", provider)
      .where("status", "in", ["active", "pending_validation"])
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
    return handleApiError("api/settings/whatsapp", error);
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

    const snap = await tenantDoc(ctx.tenantId, "settings", "whatsapp").get();
    const data = snap.exists ? snap.data() : null;

    return createApiResponse({
      mode: data?.mode ?? null,
      provider: data?.provider ?? null,
      status: data?.status ?? "not_configured",
    });
  } catch (error: unknown) {
    return handleApiError("api/settings/whatsapp", error);
  }
}
