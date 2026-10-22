import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { resolveWidget, checkRateLimit } from "@/lib/widget/service";
import { getAdminDb } from "@/lib/firebase/admin";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public widget configuration.
 *
 * Returns only display settings and the business name - never a credential
 * and never private data. The public widget id is an identifier, not an
 * authorization token.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    if (!key) return createApiError("Missing key", 400);

    const ip = request.headers.get("x-forwarded-for") ?? "local";
    if (!checkRateLimit(`resolve:${ip}`)) {
      return createApiError("Too many requests", 429);
    }

    const config = await resolveWidget(key);
    if (!config) return createApiError("Widget not found", 404);

    const profileSnap = await getAdminDb()
      .collection(`tenants/${config.tenantId}/profile`)
      .doc("main")
      .get();
    const profile = profileSnap.data() as { businessName?: string } | undefined;
    const businessName = profile?.businessName ?? "Business";

    return createApiResponse({
      businessName,
      greeting: config.greeting
        ? config.greeting
        : profile?.businessName
          ? `Hi! Welcome to ${profile.businessName}. How can I help you?`
          : "Hi! How can I help you?",
      allowStore: config.allowStore,
      theme: {
        primaryColor: config.primaryColor,
        accentColor: config.accentColor,
        themeMode: config.themeMode,
        radius: config.radius,
        density: config.density,
        fontPreset: config.fontPreset,
        logoUrl: config.logoUrl,
        launcherPosition: config.launcherPosition,
        launcherLabel: config.launcherLabel,
      },
      features: {
        showImages: config.showImages,
        showProducts: config.showProducts,
        showCart: config.showCart,
        showStorefrontLink: config.showStorefrontLink,
      },
      starterPrompts: config.starterPrompts,
    });
  } catch (error: unknown) {
    return handleApiError("api/widget/resolve", error);
  }
}
