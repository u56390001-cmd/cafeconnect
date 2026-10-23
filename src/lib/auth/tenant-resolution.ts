import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

/**
 * Tenant resolution shared by the auth endpoints.
 *
 * Order of checks for a signed-in user:
 * 1. `users/{uid}.tenantId` (written at signup)
 * 2. any active membership document under a tenant (invited staff)
 * 3. provision a fresh pending_setup tenant so the user always has one
 */
export async function resolveTenantForSession(
  uid: string
): Promise<{ tenantId: string; role: string }> {
  const db = getAdminDb();

  const userDocSnap = await db.collection("users").doc(uid).get();
  if (userDocSnap.exists) {
    const userData = userDocSnap.data();
    const tenantId = userData?.tenantId ?? null;
    const role = userData?.role ?? null;
    if (tenantId) {
      return { tenantId, role: role || "owner" };
    }
  }

  try {
    // Single-field query on purpose: a composite index on (userId, status)
    // is not guaranteed to exist on every project.
    const membershipSnap = await db
      .collectionGroup("members")
      .where("userId", "==", uid)
      .limit(5)
      .get();

    const activeMembership = membershipSnap.docs.find(
      (doc) => doc.data().status === "active"
    );

    if (activeMembership) {
      const membership = activeMembership.data();
      if (membership.tenantId) {
        return {
          tenantId: membership.tenantId,
          role: membership.role || "owner",
        };
      }
    }
  } catch (queryError: unknown) {
    console.error(
      '[api-error] scope=tenant-resolution message="membership fallback query failed"',
      queryError instanceof Error ? queryError.message : queryError
    );
  }

  // Nothing found: give the user a workspace so onboarding can proceed immediately.
  const userRecord = await getAdminAuth().getUser(uid);
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
      email: userRecord?.email ?? null,
      displayName: userRecord?.displayName ?? null,
      photoURL: userRecord?.photoURL ?? null,
      tenantId,
      role: "owner",
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );

  return { tenantId, role: "owner" };
}
