import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { createApiResponse, createApiError } from "@/lib/api/response";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      return createApiError("Missing uid", 400);
    }

    const userRecord = await getAdminAuth().getUser(uid);

    const membershipSnap = await getAdminDb()
      .collectionGroup("members")
      .where("userId", "==", uid)
      .where("status", "==", "active")
      .limit(1)
      .get();

    let tenantId: string | null = null;
    let role: string | null = null;

    if (!membershipSnap.empty) {
      const membership = membershipSnap.docs[0].data();
      tenantId = membership.tenantId || null;
      role = membership.role || null;
    }

    return createApiResponse({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      photoURL: userRecord.photoURL,
      tenantId,
      role,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return createApiError(message, 500);
  }
}
