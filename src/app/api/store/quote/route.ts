import { resolveWidget, checkRateLimit } from "@/lib/widget/service";
import { checkSharedRateLimit } from "@/lib/security/rate-limit";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { quoteOrder, OrderError, type OrderErrorCode } from "@/lib/services/orders";
import { normalizePhone } from "@/lib/domain/phone";
import { normalizeSelections } from "@/lib/services/carts";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface QuoteBody {
  key?: string;
  items?: Array<{
    itemId?: string;
    quantity?: number;
    selections?: unknown;
  }>;
  fulfilmentType?: string;
  address?: string;
}

/**
 * Authoritative pre-submission quote.
 *
 * Uses the same pricing and rule engine as order creation, so the number the
 * customer sees is the number they are charged. The quote is recalculated again
 * at submission time.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const memoryAllowed = checkRateLimit(`quote:${ip}`);
    const limit = await checkSharedRateLimit("store-quote", 30, memoryAllowed);
    if (!limit.allowed) {
      return createApiError("Too many requests, please slow down", 429);
    }

    const body = (await request.json()) as QuoteBody;
    const key = String(body.key ?? "");
    if (!key) return createApiError("Missing key", 400);

    const config = await resolveWidget(key);
    if (!config || !config.allowStore) {
      return createApiError("Store not found", 404);
    }

    const fulfilmentType =
      body.fulfilmentType === "pickup" ? "pickup" : "delivery";
    const items = Array.isArray(body.items)
      ? body.items.map((item) => ({
          itemId: String(item.itemId ?? ""),
          quantity: Number(item.quantity ?? 0),
          selections: normalizeSelections(item.selections),
        }))
      : [];

    if (items.length === 0) {
      return createApiError("Your cart is empty", 400);
    }

    const quote = await quoteOrder({
      tenantId: config.tenantId,
      items,
      fulfilmentType,
      address:
        fulfilmentType === "delivery"
          ? typeof body.address === "string"
            ? body.address.trim()
            : undefined
          : undefined,
    });

    const shortfallMinor = quote.minimumOrderMinor
      ? Math.max(0, quote.minimumOrderMinor - quote.subtotalMinor)
      : 0;

    return createApiResponse({
      subtotalMinor: quote.subtotalMinor,
      discountMinor: quote.discountMinor,
      deliveryFeeMinor: quote.deliveryFeeMinor,
      totalMinor: quote.totalMinor,
      appliedOffer: quote.appliedOfferName,
      minimumOrderMinor: quote.minimumOrderMinor,
      shortfallMinor,
      deliveryAreaStatus: quote.deliveryAreaStatus,
      deliveryAreaLabel: quote.deliveryAreaLabel,
      fulfilmentType,
    });
  } catch (error: unknown) {
    if (error instanceof OrderError) {
      const code = error.code as OrderErrorCode;
      return createApiError(
        code === "MIN_ORDER_NOT_MET"
          ? "This order is below the restaurant's minimum order value"
          : code === "OUT_OF_DELIVERY_AREA"
            ? "This address is outside the restaurant's delivery area"
            : code === "ITEM_UNAVAILABLE"
              ? "One of the items is not available right now"
              : "We could not prepare this quote",
        400,
        code
      );
    }
    return handleApiError("api/store/quote", error);
  }
}
