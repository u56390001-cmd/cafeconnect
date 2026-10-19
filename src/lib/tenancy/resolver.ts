import { getAdminDb } from "@/lib/firebase/admin";
import {
  CollectionReference,
  DocumentReference,
  Query,
} from "firebase-admin/firestore";

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

export function tenantPath(tenantId: string, subcollection: string): string {
  return `tenants/${tenantId}/${subcollection}`;
}

export function tenantCollection(
  tenantId: string,
  subcollection: string
): CollectionReference {
  return getAdminDb().collection(tenantPath(tenantId, subcollection));
}

export function tenantDoc(
  tenantId: string,
  subcollection: string,
  docId: string
): DocumentReference {
  return getAdminDb()
    .collection(tenantPath(tenantId, subcollection))
    .doc(docId);
}

export async function requireTenantScope(
  tenantId: string,
  userId: string,
  role: string
): Promise<TenantContext> {
  if (!tenantId || !userId) {
    throw new Error("Unauthorized: missing tenant or user identity");
  }

  const membershipRef = getAdminDb()
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
