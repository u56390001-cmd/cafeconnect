import { requireTenantScope, tenantDoc } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { invalidateAiContext } from "@/lib/ai/context-builder";
import { getSession } from "@/lib/auth/session";
import { deleteObject, listObjects } from "@/lib/media/storage";
import type { ImageReference } from "@/lib/media/images";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** Removes one image from a product (the file is deleted afterwards). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { itemId: string; assetId: string } }
): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const tenantId = new URL(request.url).searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");

    const itemRef = tenantDoc(ctx.tenantId, "menuItems", params.itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) return createApiError("Product not found", 404);

    const current = (itemSnap.data()?.imageReferences ?? []) as ImageReference[];
    const target = current.find((img) => img.assetId === params.assetId);
    if (!target) return createApiError("Image not found", 404);

    const next = current
      .filter((img) => img.assetId !== params.assetId)
      .map((img, index) => ({
        ...img,
        sortOrder: index + 1,
        isPrimary: index === 0,
      }));

    await itemRef.set(
      { imageReferences: next, updatedAt: new Date() },
      { merge: true }
    );

    // Best effort file cleanup - a stale file must not break the product.
    try {
      const prefix = `tenants/${ctx.tenantId}/menu-items/${params.itemId}/`;
      const names = await listObjects(prefix);
      const fileName = names.find((name) => name.includes(target.assetId));
      if (fileName) await deleteObject(fileName);
    } catch (error: unknown) {
      console.error(
        `[api-error] scope=deleteProductImage message=${
          error instanceof Error ? error.message.slice(0, 120) : "unknown"
        }`
      );
    }

    invalidateAiContext(ctx.tenantId);
    return createApiResponse({ deleted: params.assetId, imageReferences: next });
  } catch (error: unknown) {
    return handleApiError("api/menu/items/images", error);
  }
}
