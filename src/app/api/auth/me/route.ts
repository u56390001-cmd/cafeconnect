import { getAdminDb, getAdminAuth } from "@/lib/firebase/admin";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function provisionTenant(
  uid: string,
  email: string | null,
  displayName: string | null
): Promise<{ tenantId: string; role: string }> {
  const db = getAdminDb();
  const tenantRef = db.collection("tenants").doc();
  const tenantId = tenantRef.id;
  const now = new Date();

  await tenantRef.set({
    tenantId,
    businessType: [],
    status: "pending_setup",
    ownerUserId: uid,
    country: "PK",
    currency: "PKR",
    timezone: "Asia/Karachi",
    createdAt: now,
    updatedAt: now,
  });

  await tenantRef.collection("members").doc(uid).set({
    membershipId: uid,
    tenantId,
    userId: uid,
    role: "owner",
    status: "active",
    createdAt: now,
  });

  await db.collection("users").doc(uid).set(
    {
      userId: uid,
      email,
      displayName,
      photoURL: null,
      tenantId,
      role: "owner",
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );

  return { tenantId, role: "owner" };
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) {
      return createApiError("Unauthorized", 401);
    }

    const userRecord = await getAdminAuth().getUser(session.uid);

    let tenantId: string | null = null;
    let role: string | null = null;

    const userDocSnap = await getAdminDb().collection("users").doc(session.uid).get();

    if (userDocSnap.exists) {
      const userData = userDocSnap.data();
      tenantId = userData?.tenantId ?? null;
      role = userData?.role ?? null;
    }

    if (!tenantId) {
      try {
        const membershipSnap = await getAdminDb()
          .collectionGroup("members")
          .where("userId", "==", session.uid)
          .where("status", "==", "active")
          .limit(1)
          .get();

        if (!membershipSnap.empty) {
          const membership = membershipSnap.docs[0].data();
          tenantId = membership.tenantId || null;
          role = membership.role || null;
        }
      } catch (queryError: unknown) {
        console.error(
          `[api-error] scope=api/auth/me message="membership fallback query failed"`,
          queryError instanceof Error ? queryError.message : queryError
        );
      }
    }

    if (!tenantId) {
      const provisioned = await provisionTenant(
        session.uid,
        userRecord.email ?? null,
        userRecord.displayName ?? null
      );
      tenantId = provisioned.tenantId;
      role = provisioned.role;
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
    return handleApiError("api/auth/me", error);
  }
}
