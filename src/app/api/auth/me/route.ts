import { getAdminAuth } from "@/lib/firebase/admin";
import { createApiError, createApiResponse, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { resolveTenantForSession } from "@/lib/auth/tenant-resolution";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) {
      return createApiError("Unauthorized", 401);
    }

    const userRecord = await getAdminAuth().getUser(session.uid);

    const { tenantId, role } = await resolveTenantForSession(session.uid);

    return createApiResponse({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      photoURL: userRecord.photoURL,
      tenantId,
      role,
    });
  } catch (error: unknown) {
    return handleApiError("api/auth/me", error);
  }
}
