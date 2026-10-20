import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const { email, password, businessName, businessType } = await request.json();

    if (!email || !password || !businessName) {
      return createApiError("Missing required fields", 400);
    }

    const userRecord = await getAdminAuth().createUser({
      email,
      password,
      displayName: businessName,
    });

    const adminDb = getAdminDb();
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
    return handleApiError("api/auth/signup", error);
  }
}
