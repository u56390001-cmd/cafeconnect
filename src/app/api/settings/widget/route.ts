import { ensureWidgetConfig } from "@/lib/widget/service";
import { requireTenantScope } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { tenantId } = await request.json();
    if (!tenantId) return createApiError("Missing tenantId", 400);

    await requireTenantScope(tenantId, session.uid, "manage");
    const config = await ensureWidgetConfig(tenantId);

    return createApiResponse({
      publicWidgetId: config.publicWidgetId,
      enabled: config.enabled,
    });
  } catch (error: unknown) {
    return handleApiError("api/settings/widget", error);
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const tenantId = new URL(request.url).searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    await requireTenantScope(tenantId, session.uid, "manage");
    const config = await ensureWidgetConfig(tenantId);

    return createApiResponse({
      publicWidgetId: config.publicWidgetId,
      enabled: config.enabled,
    });
  } catch (error: unknown) {
    return handleApiError("api/settings/widget", error);
  }
}
