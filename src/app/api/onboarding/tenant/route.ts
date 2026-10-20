import { requireTenantScope, tenantDoc, UnauthorizedError } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
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

    if (!tenantId || !businessName) {
      return createApiError("Missing required fields", 400);
    }
    if (typeof businessType !== "string" || !BUSINESS_TYPES.includes(businessType)) {
      throw new UnauthorizedError("Invalid business type", 400);
    }
    if (typeof businessName !== "string" || businessName.length > 120) {
      throw new UnauthorizedError("Invalid business name", 400);
    }

    const ctx = await requireTenantScope(tenantId, session.uid, "owner");

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
