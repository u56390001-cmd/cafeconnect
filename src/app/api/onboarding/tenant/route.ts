import { getAdminDb } from "@/lib/firebase/admin";
import { requireTenantScope, tenantDoc } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { tenantId, userId, role, businessName, businessType } =
      await request.json();

    if (!tenantId || !userId || !businessName) {
      return createApiError("Missing required fields", 400);
    }

    const ctx = await requireTenantScope(tenantId, userId, role || "owner");

    await tenantDoc(ctx.tenantId, "profile", "main").set(
      {
        businessName,
        businessType: [businessType || "restaurant"],
        country: "PK",
        timezone: "Asia/Karachi",
        currency: "PKR",
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return createApiResponse({ success: true });
  } catch (error: unknown) {
    return handleApiError("api/onboarding/tenant", error);
  }
}
