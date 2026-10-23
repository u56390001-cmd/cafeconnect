import { requireTenantScope, tenantDoc, UnauthorizedError } from "@/lib/tenancy/resolver";
import { getAdminDb } from "@/lib/firebase/admin";
import { createApiError, createApiResponse, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { resolveTenantForSession } from "@/lib/auth/tenant-resolution";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const BUSINESS_TYPES = [
  "restaurant",
  "cafe",
  "foodStall",
  "bakery",
  "takeaway",
  "cloudKitchen",
  "homeChef",
  "catering",
];

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { tenantId, businessName, businessType, country, currency } =
      await request.json();

    if (!businessName) {
      return createApiError("Business name is required", 400);
    }

    // The client may race /api/auth/me right after signup and send no tenantId
    // yet — resolve (or provision) the workspace from the session instead of
    // failing with a generic validation error.
    const resolved = tenantId
      ? { tenantId }
      : await resolveTenantForSession(session.uid);
    if (typeof businessType !== "string" || !BUSINESS_TYPES.includes(businessType)) {
      throw new UnauthorizedError("Invalid business type", 400);
    }
    if (typeof businessName !== "string" || businessName.length > 120) {
      throw new UnauthorizedError("Invalid business name", 400);
    }

    const ctx = await requireTenantScope(resolved.tenantId, session.uid, "owner");

    // Keep the user document linked so later sessions resolve the tenant
    // even if signup never wrote it (e.g. Google sign-in).
    await getAdminDb()
      .collection("users")
      .doc(session.uid)
      .set({ tenantId: ctx.tenantId, updatedAt: new Date() }, { merge: true });

    await tenantDoc(ctx.tenantId, "profile", "main").set(
      {
        businessName: businessName.trim(),
        businessType: [businessType],
        country: country || "PK",
        timezone: "Asia/Karachi",
        currency: currency || "PKR",
        updatedAt: new Date(),
      },
      { merge: true }
    );

    await tenantDoc(ctx.tenantId, "settings", "ai").set(
      {
        language: "en",
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return createApiResponse({ success: true });
  } catch (error: unknown) {
    return handleApiError("api/onboarding/tenant", error);
  }
}
