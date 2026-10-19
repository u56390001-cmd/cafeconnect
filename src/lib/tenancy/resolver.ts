import { adminDb } from "@/lib/firebase/admin";
import { CollectionReference, DocumentReference, Query } from "firebase-admin/firestore";

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

export function tenantPath(tenantId: string, subcollection: string): string {
  return `tenants/${tenantId}/${subcollection}`;
}

export function tenantRef(
  tenantId: string,
  subcollection: string,
  docId?: string
): DocumentReference | CollectionReference {
  const ref = adminDb.collection(tenantPath(tenantId, subcollection));
  return docId ? ref.doc(docId) : ref;
}

export async function requireTenantScope(
  tenantId: string,
  userId: string,
  role: string
): Promise<TenantContext> {
  if (!tenantId || !userId) {
    throw new Error("Unauthorized: missing tenant or user identity");
  }

  const membershipRef = adminDb
    .collection(`tenants/${tenantId}/members`)
    .doc(userId);
  const membershipSnap = await membershipRef.get();

  if (!membershipSnap.exists) {
    throw new Error("Unauthorized: user is not a member of this tenant");
  }

  const membership = membershipSnap.data();
  if (membership?.status !== "active") {
    throw new Error("Unauthorized: membership is not active");
  }

  return { tenantId, userId, role: membership?.role || role };
}

export function scopedQuery<T>(
  baseQuery: Query<T>,
  tenantId: string
): Query<T> {
  return baseQuery.where("tenantId", "==", tenantId);
}
