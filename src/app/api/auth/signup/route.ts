import { getAdminAuth, getAdminDb, type DocRef } from "@/lib/firebase/admin";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { email, password, businessName, businessType } = await request.json();

    if (!email || !password || !businessName) {
      return createApiError("Missing required fields", 400);
    }

    // Create the auth account; if the email is already registered (e.g. a
    // previous signup attempt failed halfway) continue with that account
    // instead of failing — the workspace rows below are idempotent.
    let uid: string;
    let resolvedEmail: string;
    try {
      const created = await getAdminAuth().createUser({
        email,
        password,
        displayName: businessName,
      });
      uid = created.uid;
      resolvedEmail = created.email ?? email;
    } catch (createError: unknown) {
      const message = createError instanceof Error ? createError.message : "";
      if (!/already|registered|exists/i.test(message)) throw createError;
      const existing = await getAdminAuth().getUserByEmail(email);
      if (!existing) throw createError;
      uid = existing.uid;
      resolvedEmail = existing.email ?? email;
    }

    const adminDb = getAdminDb();
    const userDoc = adminDb.collection("users").doc(uid);
    const existingUser = await userDoc.get();
    const existingTenantId =
      (existingUser.exists
        ? (existingUser.data() as { tenantId?: string } | undefined)?.tenantId
        : undefined) ?? null;

    if (existingTenantId) {
      // Already provisioned — just report success so the client can sign in.
      return createApiResponse(
        { uid, tenantId: existingTenantId, role: "owner" },
        200
      );
    }

    const tenantRef = adminDb.collection("tenants").doc() as DocRef;
    const tenantId = tenantRef.id;

    await tenantRef.set({
      tenantId,
      businessName,
      businessType: [businessType || "restaurant"],
      status: "active",
      ownerUserId: uid,
      country: "PK",
      timezone: "Asia/Karachi",
      currency: "PKR",
      enabledModules: ["chat", "knowledge", "settings"],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await adminDb
      .collection(`tenants/${tenantId}/members`)
      .doc(uid)
      .set({
        membershipId: uid,
        tenantId,
        userId: uid,
        role: "owner",
        status: "active",
        invitedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    await adminDb.collection("users").doc(uid).set({
      userId: uid,
      email: resolvedEmail,
      displayName: businessName,
      photoURL: null,
      tenantId,
      role: "owner",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return createApiResponse({ uid, tenantId, role: "owner" }, 201);
  } catch (error: unknown) {
    return handleApiError("api/auth/signup", error);
  }
}
