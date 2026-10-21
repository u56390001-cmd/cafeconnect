import { requireTenantScope, tenantDoc } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";
import {
  qrProviderConfigured,
  readQrTrialState,
  refreshQrTrialConnection,
  startQrTrial,
  stopQrTrial,
  webhookPublicUrl,
  hasTenantProviderKey,
} from "@/lib/whatsapp/qr-trial";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const tenantId = new URL(request.url).searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    await requireTenantScope(tenantId, session.uid, "manage");

    const state = await readQrTrialState(tenantId);
    const tenantKey = await hasTenantProviderKey(tenantId);

    return createApiResponse({
      providerConfigured: qrProviderConfigured(),
      usingTenantKey: tenantKey,
      state,
      webhookUrl: qrProviderConfigured() ? webhookPublicUrl() : null,
    });
  } catch (error: unknown) {
    return handleApiError("api/settings/whatsapp/qr", error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = (await request.json()) as {
      tenantId?: string;
      action?: "start" | "refresh" | "stop";
    };
    const { tenantId, action = "refresh" } = body;
    if (!tenantId) return createApiError("Missing tenantId", 400);

    await requireTenantScope(tenantId, session.uid, "manage");

    if (!qrProviderConfigured()) {
      return createApiError(
        "QR WhatsApp provider is not configured on this deployment",
        503
      );
    }

    if (action === "start") {
      const state = await startQrTrial(tenantId, session.uid);
      return createApiResponse({ state });
    }

    if (action === "stop") {
      await stopQrTrial(tenantId);
      const state = await readQrTrialState(tenantId);
      return createApiResponse({ state });
    }

    const state = await refreshQrTrialConnection(tenantId);
    return createApiResponse({ state });
  } catch (error: unknown) {
    return handleApiError("api/settings/whatsapp/qr", error);
  }
}
