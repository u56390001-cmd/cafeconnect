import { requireTenantScope, tenantDoc } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { invalidateAiContext } from "@/lib/ai/context-builder";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type BulkAction = "publish" | "unpublish" | "pause" | "restore" | "available";

interface BulkBody {
  tenantId?: string;
  itemIds?: string[];
  action?: BulkAction;
}

/** Bulk publish / pause / restore for several products at once. */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = (await request.json()) as BulkBody;
    if (!body.tenantId || !Array.isArray(body.itemIds) || body.itemIds.length === 0) {
      return createApiError("Missing tenantId or itemIds", 400);
    }
    if (!body.action) return createApiError("Missing action", 400);

    const ctx = await requireTenantScope(body.tenantId, session.uid, "manage");

    let updated = 0;
    for (const itemId of body.itemIds.slice(0, 100)) {
      const ref = tenantDoc(ctx.tenantId, "menuItems", itemId);
      const snap = await ref.get();
      if (!snap.exists) continue;

      const update: Record<string, unknown> = { updatedAt: new Date() };
      switch (body.action) {
        case "publish":
          update.publicationStatus = "published";
          update.status = "active";
          break;
        case "unpublish":
          update.publicationStatus = "draft";
          break;
        case "pause":
          update.availability = "paused";
          break;
        case "available":
          update.availability = "available";
          break;
        case "restore":
          update.status = "active";
          update.publicationStatus = "draft";
          update.availability = "available";
          break;
        default:
          return createApiError("Invalid action", 400);
      }

      await ref.set(update, { merge: true });
      updated += 1;
    }

    invalidateAiContext(ctx.tenantId);

    return createApiResponse({ updated, action: body.action });
  } catch (error: unknown) {
    return handleApiError("api/menu/items/bulk", error);
  }
}
