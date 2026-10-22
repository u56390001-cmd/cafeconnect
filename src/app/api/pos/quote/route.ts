import { NextRequest } from "next/server";
import { requireTenantScope } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { quoteOrder, OrderError, type OrderItemInput } from "@/lib/services/orders";
import { normalizeSelections } from "@/lib/services/carts";

export const dynamic = "force-dynamic";

/**
 * Authoritative price for the order being taken at the counter.
 *
 * The POS never adds prices up in the browser: the same pricing engine that
 * prices the online order prices the counter order, so the bill, the KOT and
 * the kitchen always agree.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = (await request.json()) as {
      tenantId?: string;
      items?: Array<{
        itemId?: string;
        quantity?: number;
        selections?: unknown;
      }>;
      fulfilmentType?: "delivery" | "pickup";
      address?: string;
    };
    if (!body.tenantId) return createApiError("Missing tenantId", 400);

    const ctx = await requireTenantScope(body.tenantId, session.uid, "orders");

    const items: OrderItemInput[] = (Array.isArray(body.items) ? body.items : []).map(
      (item) => ({
        itemId: String(item.itemId ?? ""),
        quantity: Number(item.quantity ?? 0),
        selections: normalizeSelections(item.selections),
      })
    );

    if (items.length === 0) {
      return createApiResponse({
        items: [],
        subtotalMinor: 0,
        discountMinor: 0,
        deliveryFeeMinor: 0,
        totalMinor: 0,
        appliedOfferName: null,
        minimumOrderMinor: null,
        minimumOrderMet: true,
        deliveryAreaStatus: "not_applicable",
        deliveryAreaLabel: null,
        blockedReason: null,
      });
    }

    const fulfilmentType = body.fulfilmentType === "delivery" ? "delivery" : "pickup";

    try {
      const quote = await quoteOrder({
        tenantId: ctx.tenantId,
        items,
        fulfilmentType,
        address: fulfilmentType === "delivery" ? body.address : undefined,
        // A counter order can be priced before the address is known; the
        // order itself still enforces the delivery rule.
        requireAddress: false,
      });

      return createApiResponse({
        items: quote.items,
        subtotalMinor: quote.subtotalMinor,
        discountMinor: quote.discountMinor,
        deliveryFeeMinor: quote.deliveryFeeMinor,
        totalMinor: quote.totalMinor,
        appliedOfferName: quote.appliedOfferName,
        minimumOrderMinor: quote.minimumOrderMinor,
        minimumOrderMet:
          !quote.minimumOrderMinor || quote.subtotalMinor >= quote.minimumOrderMinor,
        deliveryAreaStatus: quote.deliveryAreaStatus,
        deliveryAreaLabel: quote.deliveryAreaLabel,
        blockedReason: null,
      });
    } catch (error: unknown) {
      if (error instanceof OrderError) {
        // The order cannot be placed yet - tell the staff why, without
        // failing the whole request.
        return createApiResponse({
          items: [],
          subtotalMinor: 0,
          discountMinor: 0,
          deliveryFeeMinor: 0,
          totalMinor: 0,
          appliedOfferName: null,
          minimumOrderMinor: null,
          minimumOrderMet: false,
          deliveryAreaStatus: "not_applicable",
          deliveryAreaLabel: null,
          blockedReason: error.message,
          blockedCode: error.code,
        });
      }
      throw error;
    }
  } catch (error: unknown) {
    return handleApiError("api/pos/quote", error);
  }
}
