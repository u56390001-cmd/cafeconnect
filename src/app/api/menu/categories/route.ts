import { requireTenantScope, tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { invalidateAiContext } from "@/lib/ai/context-builder";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const tenantId = new URL(request.url).searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    const ctx = await requireTenantScope(tenantId, session.uid, "member");

    const snap = await tenantCollection(ctx.tenantId, "menuCategories")
      .where("status", "==", "active")
      .get();

    const categories = snap.docs
      .sort((a, b) => (a.data().sortOrder ?? 0) - (b.data().sortOrder ?? 0))
      .map((doc) => {
        const d = doc.data();
        return {
          categoryId: d.categoryId || doc.id,
          name: d.name,
          sortOrder: d.sortOrder ?? 0,
          createdAt: d.createdAt,
        };
      });

    return createApiResponse({ categories });
  } catch (error: unknown) {
    return handleApiError("api/menu/categories", error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { tenantId, name } = await request.json();
    if (!tenantId || typeof name !== "string" || !name.trim() || name.length > 80) {
      return createApiError("Invalid category name", 400);
    }

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");

    const docRef = tenantCollection(ctx.tenantId, "menuCategories").doc();
    await docRef.set({
      categoryId: docRef.id,
      tenantId: ctx.tenantId,
      name: name.trim(),
      sortOrder: Date.now(),
      status: "active",
      createdBy: ctx.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    invalidateAiContext(ctx.tenantId);

    return createApiResponse(
      { categoryId: docRef.id, name: name.trim() },
      201
    );
  } catch (error: unknown) {
    return handleApiError("api/menu/categories", error);
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const categoryId = searchParams.get("categoryId");
    if (!tenantId || !categoryId) {
      return createApiError("Missing tenantId or categoryId", 400);
    }

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");

    await tenantDoc(ctx.tenantId, "menuCategories", categoryId).set(
      { status: "archived", updatedAt: new Date() },
      { merge: true }
    );

    invalidateAiContext(ctx.tenantId);

    return createApiResponse({ deleted: categoryId });
  } catch (error: unknown) {
    return handleApiError("api/menu/categories", error);
  }
}

