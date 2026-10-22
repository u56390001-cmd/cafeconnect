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

    // The dashboard also needs archived categories (restore path) and the
    // number of products inside each category.
    const [snap, itemsSnap] = await Promise.all([
      tenantCollection(ctx.tenantId, "menuCategories").get(),
      tenantCollection(ctx.tenantId, "menuItems").get(),
    ]);

    const counts = new Map<string, number>();
    for (const doc of itemsSnap.docs) {
      const data = doc.data();
      if (data.status === "archived") continue;
      const key = String(data.categoryId ?? "");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const categories = snap.docs
      .sort((a, b) => (a.data().sortOrder ?? 0) - (b.data().sortOrder ?? 0))
      .map((doc) => {
        const d = doc.data();
        return {
          categoryId: d.categoryId || doc.id,
          name: d.name,
          sortOrder: d.sortOrder ?? 0,
          status: d.status ?? "active",
          itemCount: counts.get(d.categoryId || doc.id) ?? 0,
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

    // Duplicate names are a visible validation error, not a silent merge.
    const existing = await tenantCollection(ctx.tenantId, "menuCategories")
      .where("name", "==", name.trim())
      .get();
    if (!existing.empty) {
      return createApiError("A category with this name already exists", 409);
    }

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

/** Rename, reorder, or restore a category. */
export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = (await request.json()) as {
      tenantId?: string;
      categoryId?: string;
      name?: string;
      sortOrder?: number;
      status?: string;
    };
    if (!body.tenantId || !body.categoryId) {
      return createApiError("Missing tenantId or categoryId", 400);
    }

    const ctx = await requireTenantScope(body.tenantId, session.uid, "manage");

    const ref = tenantDoc(ctx.tenantId, "menuCategories", body.categoryId);
    const snap = await ref.get();
    if (!snap.exists) return createApiError("Category not found", 404);

    const update: Record<string, unknown> = { updatedAt: new Date() };

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 80) {
        return createApiError("Invalid category name", 400);
      }
      const others = await tenantCollection(ctx.tenantId, "menuCategories")
        .where("name", "==", body.name.trim())
        .get();
      const clash = others.docs.some((doc) => doc.id !== body.categoryId);
      if (clash) {
        return createApiError("A category with this name already exists", 409);
      }
      update.name = body.name.trim();
    }

    if (body.sortOrder !== undefined) {
      if (!Number.isFinite(body.sortOrder)) {
        return createApiError("Invalid sort order", 400);
      }
      update.sortOrder = Math.round(body.sortOrder);
    }

    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "archived") {
        return createApiError("Invalid status", 400);
      }
      update.status = body.status;
    }

    await ref.set(update, { merge: true });
    invalidateAiContext(ctx.tenantId);

    return createApiResponse({ categoryId: body.categoryId, updated: true });
  } catch (error: unknown) {
    return handleApiError("api/menu/categories", error);
  }
}

/**
 * Archives a category with an explicit policy for the products inside it, so
 * published products never silently disappear.
 */
export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const categoryId = searchParams.get("categoryId");
    const itemPolicy = searchParams.get("itemPolicy") ?? "reassign";
    const reassignTo = searchParams.get("reassignTo");
    if (!tenantId || !categoryId) {
      return createApiError("Missing tenantId or categoryId", 400);
    }
    if (itemPolicy !== "reassign" && itemPolicy !== "archive" && itemPolicy !== "keep") {
      return createApiError("Invalid item policy", 400);
    }

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");

    const items = await tenantCollection(ctx.tenantId, "menuItems")
      .where("categoryId", "==", categoryId)
      .get();

    const affected = items.docs.filter((doc) => doc.data().status !== "archived");

    if (itemPolicy === "reassign") {
      if (!reassignTo) {
        return createApiError(
          "Choose the category the products should move to",
          400
        );
      }
      const targetSnap = await tenantDoc(
        ctx.tenantId,
        "menuCategories",
        reassignTo
      ).get();
      if (!targetSnap.exists || targetSnap.data()?.status !== "active") {
        return createApiError("Target category not found", 400);
      }
      for (const doc of affected) {
        await doc.ref.set({ categoryId: reassignTo, updatedAt: new Date() }, { merge: true });
      }
    } else if (itemPolicy === "archive") {
      for (const doc of affected) {
        await doc.ref.set(
          {
            status: "archived",
            publicationStatus: "draft",
            availability: "paused",
            updatedAt: new Date(),
          },
          { merge: true }
        );
      }
    }

    await tenantDoc(ctx.tenantId, "menuCategories", categoryId).set(
      { status: "archived", updatedAt: new Date() },
      { merge: true }
    );

    invalidateAiContext(ctx.tenantId);

    return createApiResponse({
      deleted: categoryId,
      itemsMoved: itemPolicy === "reassign" ? affected.length : 0,
      itemsArchived: itemPolicy === "archive" ? affected.length : 0,
    });
  } catch (error: unknown) {
    return handleApiError("api/menu/categories", error);
  }
}
