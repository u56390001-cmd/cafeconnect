import { randomBytes } from "crypto";
import { requireTenantScope, tenantDoc } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { invalidateAiContext } from "@/lib/ai/context-builder";
import { getSession } from "@/lib/auth/session";
import { uploadObject } from "@/lib/media/storage";
import { inspectImage, type ImageReference } from "@/lib/media/images";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Uploads one product image.
 *
 * The file is validated from its bytes (never from the extension or the
 * browser MIME type), stored under a tenant-scoped Storage path, and only
 * then referenced from the product document.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { itemId: string } }
): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const tenantId = new URL(request.url).searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");

    const itemRef = tenantDoc(ctx.tenantId, "menuItems", params.itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) {
      return createApiError("Product not found", 404);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return createApiError("Expected a file upload", 400);
    }

    const file = form.get("file");
    const altText = String(form.get("altText") ?? "").slice(0, 160);
    if (!file || typeof file === "string") {
      return createApiError("No image file was provided", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const inspection = inspectImage(buffer);
    if (!inspection.ok) {
      return createApiError(inspection.error ?? "Invalid image", 400);
    }

    const assetId = `img_${randomBytes(9).toString("hex")}`;
    const path = `tenants/${ctx.tenantId}/menu-items/${params.itemId}/${assetId}.${inspection.extension}`;

    try {
      await uploadObject(path, buffer, `image/${inspection.format}`);
    } catch (error: unknown) {
      console.error(
        `[api-error] scope=uploadProductImage tenant=${ctx.tenantId} message=${
          error instanceof Error ? error.message.slice(0, 160) : "unknown"
        }`
      );
      return createApiError("The image could not be stored. Try again.", 502);
    }

    const reference: ImageReference = {
      assetId,
      url: `/api/media/${assetId}`,
      altText,
      width: inspection.width ?? null,
      height: inspection.height ?? null,
      sortOrder: 0,
      isPrimary: false,
      status: "ready",
      createdAt: new Date().toISOString(),
    };

    const current = (itemSnap.data()?.imageReferences ?? []) as ImageReference[];
    const next = [...current, reference].map((img, index) => ({
      ...img,
      sortOrder: index + 1,
      isPrimary: index === 0,
    }));

    await itemRef.set(
      { imageReferences: next, updatedAt: new Date() },
      { merge: true }
    );
    invalidateAiContext(ctx.tenantId);

    return createApiResponse({ image: reference, imageReferences: next }, 201);
  } catch (error: unknown) {
    return handleApiError("api/menu/items/images", error);
  }
}
