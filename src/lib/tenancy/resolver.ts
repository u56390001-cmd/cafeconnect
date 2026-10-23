import { getAdminDb } from "@/lib/firebase/admin";
import type {
  CollectionImpl as CollectionReference,
  Query,
  DocRef as DocumentReference,
} from "@/lib/db/firestore-compat";

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
}

export class UnauthorizedError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export type RequiredRole = "member" | "orders" | "manage" | "owner";

const ROLE_LEVELS: Record<string, number> = {
  owner: 50,
  admin: 40,
  manager: 30,
  orderStaff: 20,
  knowledgeEditor: 20,
  readOnly: 10,
};

function meetsRole(role: string, required: RequiredRole): boolean {
  const level = ROLE_LEVELS[role] ?? 0;
  switch (required) {
    case "owner":
      return role === "owner";
    case "manage":
      return level >= ROLE_LEVELS.manager;
    case "orders":
      return level >= ROLE_LEVELS.orderStaff;
    case "member":
    default:
      return level >= ROLE_LEVELS.readOnly;
  }
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
  required: RequiredRole = "member"
): Promise<TenantContext> {
  if (!tenantId || !userId) {
    throw new UnauthorizedError("Unauthorized: missing tenant or user identity");
  }

  const membershipSnap = await getAdminDb()
    .collection(`tenants/${tenantId}/members`)
    .doc(userId)
    .get();

  if (!membershipSnap.exists) {
    throw new UnauthorizedError("Unauthorized: user is not a member of this tenant");
  }

  const membership = membershipSnap.data();
  if (membership?.status !== "active") {
    throw new UnauthorizedError("Unauthorized: membership is not active");
  }

  const role = membership?.role || "readOnly";
  if (!meetsRole(role, required)) {
    throw new UnauthorizedError("Forbidden: insufficient permissions", 403);
  }

  return { tenantId, userId, role };
}

export function scopedQuery(
  baseQuery: Query,
  tenantId: string
) {
  return baseQuery.where("tenantId", "==", tenantId);
}
