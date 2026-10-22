import { NextRequest } from "next/server";
import {
  requireTenantScope,
  tenantCollection,
  tenantDoc,
} from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import {
  ensureCart,
  getCart,
  updateCart,
  normalizeSelections,
  cartIdForConversation,
} from "@/lib/services/carts";

export const dynamic = "force-dynamic";

/**
 * Point of sale drafts.
 *
 * A draft is work in progress, not an order. It is stored in the existing
 * cart collection with `channel: "pos"`, so no new collection and no new
 * schema is introduced, and the order service stays the only place where
 * money is calculated.
 */

const DRAFT_PREFIX = "pos_draft_";

interface DraftBody {
  tenantId?: string;
  draftId?: string;
  items?: Array<{
    itemId?: string;
    quantity?: number;
    selections?: unknown;
    note?: string;
  }>;
  customerName?: string;
  customerPhone?: string;
  fulfilmentType?: "delivery" | "pickup";
  address?: string;
  notes?: string;
}

function draftConversationId(draftId: string): string {
  return `${DRAFT_PREFIX}${draftId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40)}`;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const tenantId = new URL(request.url).searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    const ctx = await requireTenantScope(tenantId, session.uid, "orders");

    const snap = await tenantCollection(ctx.tenantId, "carts")
      .where("channel", "==", "pos")
      .get();

    const drafts = snap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          draftId: String(d.conversationId ?? "").replace(DRAFT_PREFIX, ""),
          items: d.items ?? [],
          customer: d.customer ?? {},
          fulfilment: d.fulfilment ?? {},
          notes: d.notes ?? "",
          updatedAt: d.updatedAt,
          createdAt: d.createdAt,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt as Date).getTime() -
          new Date(a.updatedAt as Date).getTime()
      );

    return createApiResponse({ drafts });
  } catch (error: unknown) {
    return handleApiError("api/pos/drafts", error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = (await request.json()) as DraftBody;
    if (!body.tenantId) return createApiError("Missing tenantId", 400);
    if (!body.draftId) return createApiError("Missing draftId", 400);

    const ctx = await requireTenantScope(body.tenantId, session.uid, "orders");

    const conversationId = draftConversationId(body.draftId);
    const cart = await ensureCart({
      tenantId: ctx.tenantId,
      conversationId,
      channel: "pos",
      customerReference: conversationId,
    });

    const items = Array.isArray(body.items) ? body.items : [];
    await updateCart({
      tenantId: ctx.tenantId,
      cartId: cart.cartId,
      operation: items.length > 0 ? "replace" : "clear",
      items: items.map((item) => ({
        itemId: String(item.itemId ?? ""),
        quantity: Math.max(0, Math.min(20, Number(item.quantity ?? 0))),
        selections: normalizeSelections(item.selections),
        note: typeof item.note === "string" ? item.note.slice(0, 200) : undefined,
      })),
      customerName:
        typeof body.customerName === "string" ? body.customerName : undefined,
      customerPhone:
        typeof body.customerPhone === "string" ? body.customerPhone : undefined,
      fulfilmentType: body.fulfilmentType === "delivery" ? "delivery" : "pickup",
      address: typeof body.address === "string" ? body.address : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      currency: "PKR",
    });

    const saved = await getCart(ctx.tenantId, cartIdForConversation(conversationId));

    return createApiResponse({
      draftId: body.draftId,
      items: saved?.items ?? [],
      updatedAt: saved?.updatedAt ?? new Date(),
    });
  } catch (error: unknown) {
    return handleApiError("api/pos/drafts", error);
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const draftId = searchParams.get("draftId");
    if (!tenantId || !draftId) {
      return createApiError("Missing tenantId or draftId", 400);
    }

    const ctx = await requireTenantScope(tenantId, session.uid, "orders");

    await tenantDoc(
      ctx.tenantId,
      "carts",
      cartIdForConversation(draftConversationId(draftId))
    ).set(
      { status: "abandoned", updatedAt: new Date() },
      { merge: true }
    );

    return createApiResponse({ deleted: draftId });
  } catch (error: unknown) {
    return handleApiError("api/pos/drafts", error);
  }
}
