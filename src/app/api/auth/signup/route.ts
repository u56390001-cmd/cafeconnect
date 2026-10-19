import { adminAuth, adminDb } from "@/lib/firebase/admin";
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

    const userRecord = await adminAuth.getUser(uid);

    // Fetch tenant membership from Firestore
    const membershipSnap = await adminDb
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

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { email, password, businessName, businessType } =
      await request.json();

    if (!email || !password || !businessName) {
      return createApiError("Missing required fields", 400);
    }

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: businessName,
    });

    // Create tenant record
    const tenantRef = adminDb.collection("tenants").doc();
    const tenantId = tenantRef.id;

    await tenantRef.set({
      tenantId,
      businessName,
      businessType: [businessType || "restaurant"],
      status: "active",
      ownerUserId: userRecord.uid,
      country: "PK",
      timezone: "Asia/Karachi",
      currency: "PKR",
      enabledModules: ["chat", "knowledge", "settings"],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create owner membership
    await adminDb
      .collection(`tenants/${tenantId}/members`)
      .doc(userRecord.uid)
      .set({
        membershipId: userRecord.uid,
        tenantId,
        userId: userRecord.uid,
        role: "owner",
        status: "active",
        invitedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    // Create global user profile
    await adminDb.collection("users").doc(userRecord.uid).set({
      userId: userRecord.uid,
      email: userRecord.email,
      displayName: businessName,
      photoURL: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return createApiResponse(
      {
        uid: userRecord.uid,
        tenantId,
        role: "owner",
      },
      201
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return createApiError(message, 500);
  }
}
