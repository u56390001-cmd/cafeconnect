import { requireTenantScope, tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { invalidateAiContext } from "@/lib/ai/context-builder";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface DuplicateBody {
  tenantId?: string;
  itemId?: string;
  name?: string;
}

/** Duplicates a product (handy for size or spice variants). */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = (await request.json()) as DuplicateBody;
    if (!body.tenantId || !body.itemId) {
      return createApiError("Missing tenantId or itemId", 400);
    }

    const ctx = await requireTenantScope(body.tenantId, session.uid, "manage");

    const sourceSnap = await tenantDoc(ctx.tenantId, "menuItems", body.itemId).get();
    if (!sourceSnap.exists) {
      return createApiError("Product not found", 404);
    }
    const source = sourceSnap.data()!;

    const docRef = tenantCollection(ctx.tenantId, "menuItems").doc();
    const now = new Date();
    await docRef.set(
      {
        ...source,
        itemId: docRef.id,
        tenantId: ctx.tenantId,
        name: (body.name ?? `${source.name} (copy)`).slice(0, 120),
        status: "active",
        publicationStatus: "draft",
        imageReferences: [],
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    invalidateAiContext(ctx.tenantId);

    return createApiResponse({ itemId: docRef.id }, 201);
  } catch (error: unknown) {
    return handleApiError("api/menu/items/duplicate", error);
  }
}
