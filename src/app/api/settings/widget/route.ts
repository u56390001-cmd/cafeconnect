import {
  ensureWidgetConfig,
  updateWidgetBranding,
  sanitizeBranding,
  DEFAULT_BRANDING,
  type WidgetBranding,
} from "@/lib/widget/service";
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
      allowStore: config.allowStore,
      branding: {
        primaryColor: config.primaryColor,
        accentColor: config.accentColor,
        themeMode: config.themeMode,
        radius: config.radius,
        density: config.density,
        fontPreset: config.fontPreset,
        logoUrl: config.logoUrl,
        launcherPosition: config.launcherPosition,
        launcherLabel: config.launcherLabel,
        greeting: config.greeting,
        starterPrompts: config.starterPrompts,
        showImages: config.showImages,
        showProducts: config.showProducts,
        showCart: config.showCart,
        showStorefrontLink: config.showStorefrontLink,
      },
      defaults: DEFAULT_BRANDING,
    });
  } catch (error: unknown) {
    return handleApiError("api/settings/widget", error);
  }
}

/** Updates the widget branding. Display settings only. */
export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = (await request.json()) as {
      tenantId?: string;
      branding?: Record<string, unknown>;
    };
    if (!body.tenantId) return createApiError("Missing tenantId", 400);

    const ctx = await requireTenantScope(body.tenantId, session.uid, "manage");
    const config = await updateWidgetBranding(
      ctx.tenantId,
      body.branding ?? {}
    );

    const branding: WidgetBranding = sanitizeBranding(
      config as unknown as Record<string, unknown>,
      DEFAULT_BRANDING
    );

    return createApiResponse({
      publicWidgetId: config.publicWidgetId,
      branding,
    });
  } catch (error: unknown) {
    return handleApiError("api/settings/widget", error);
  }
}
