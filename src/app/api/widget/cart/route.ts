import { NextRequest } from "next/server";
import { resolveWidget, checkRateLimit } from "@/lib/widget/service";
import { checkSharedRateLimit } from "@/lib/security/rate-limit";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import {
  ensureCart,
  quoteCart,
  submitCart,
  updateCart,
  normalizeSelections,
  type CartDocument,
  type CartQuote,
} from "@/lib/services/carts";
import { normalizePhone } from "@/lib/domain/phone";
import { createTrackingToken } from "@/lib/tracking/token";
import { tenantDoc } from "@/lib/tenancy/resolver";

export const dynamic = "force-dynamic";

/**
 * Public widget cart.
 *
 * The widget uses the same server cart as the AI assistant, so the customer
 * sees one cart no matter whether they add items by tapping a card or by
 * typing. Prices always come from the server quote; the browser never sends
 * an authoritative price.
 *
 * The visitor is identified by a high-entropy conversation id created by the
 * widget (not by IP and not by a third-party cookie).
 */

const CONVERSATION_ID = /^w_[A-Za-z0-9_-]{16,64}$/;

/** The tenant's configured currency - never a hardcoded assumption. */
async function tenantCurrency(tenantId: string): Promise<string> {
  const snap = await tenantDoc(tenantId, "profile", "main").get();
  const currency = snap.data()?.currency;
  return typeof currency === "string" && currency.length <= 8 ? currency : "PKR";
}

interface CartRequestBody {
  key?: string;
  conversationId?: string;
  visitorId?: string;
  operation?: "add" | "remove" | "set" | "clear" | "checkout";
  items?: Array<{
    itemId?: string;
    quantity?: number;
    selections?: unknown;
  }>;
  customerName?: string;
  customerPhone?: string;
  fulfilmentType?: string;
  address?: string;
  notes?: string;
  idempotencyKey?: string;
}

function cartPayload(
  cart: CartDocument,
  quote: CartQuote | null,
  currency: string
) {
  const money = (minor: number) => `${currency} ${Math.round(minor / 100)}`;
  const subtotalMinor = cart.items.reduce(
    (sum, line) => sum + (line.lineTotalMinor ?? 0),
    0
  );
  return {
    cartId: cart.cartId,
    revision: Number(cart.cartRevision ?? 0),
    status: cart.status,
    itemCount: cart.items.reduce((sum, line) => sum + line.quantity, 0),
    subtotalMinor: quote?.subtotalMinor ?? subtotalMinor,
    subtotalLabel: quote?.subtotalLabel ?? money(subtotalMinor),
    discountMinor: quote?.discountMinor ?? 0,
    discountLabel: quote?.discountLabel ?? money(0),
    deliveryFeeMinor: quote?.deliveryFeeMinor ?? 0,
    deliveryFeeLabel: quote?.deliveryFeeLabel ?? money(0),
    totalMinor: quote?.totalMinor ?? subtotalMinor,
    totalLabel: quote?.totalLabel ?? money(subtotalMinor),
    appliedOffer: quote?.appliedOffer ?? null,
    minimumOrderLabel: quote?.minimumOrderLabel ?? null,
    deliveryAreaStatus: quote?.deliveryAreaStatus ?? "not_applicable",
    totalIsFinal: quote !== null,
    lines: cart.items.map((line) => ({
      itemId: line.itemId,
      name: line.name,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      lineTotalMinor: line.lineTotalMinor,
      options: (line.options ?? []).map((option) => ({
        groupName: option.groupName,
        optionNames: option.optionNames,
      })),
    })),
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const key = String(searchParams.get("key") ?? "");
    const conversationId = String(searchParams.get("conversationId") ?? "");
    if (!key) return createApiError("Missing key", 400);
    if (!CONVERSATION_ID.test(conversationId)) {
      return createApiError("Invalid conversation", 400);
    }

    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const memoryAllowed = checkRateLimit(`widget-cart:${ip}`);
    const limit = await checkSharedRateLimit("widget-cart", 60, memoryAllowed);
    if (!limit.allowed) return createApiError("Too many requests", 429);

    const config = await resolveWidget(key);
    if (!config) return createApiError("Widget not found", 404);
    const currency = await tenantCurrency(config.tenantId);

    const cart = await ensureCart({
      tenantId: config.tenantId,
      conversationId,
      channel: "web",
      customerReference: conversationId,
    });

    let quote: CartQuote | null = null;
    if ((cart.items ?? []).length > 0 && cart.status !== "submitted") {
      try {
        quote = (await quoteCart({
          tenantId: config.tenantId,
          cartId: cart.cartId,
          currency: currency,
        })).quote;
      } catch {
        quote = null;
      }
    }

    return createApiResponse(cartPayload(cart, quote, currency));
  } catch (error: unknown) {
    return handleApiError("api/widget/cart", error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const memoryAllowed = checkRateLimit(`widget-cart:${ip}`);
    const limit = await checkSharedRateLimit("widget-cart", 60, memoryAllowed);
    if (!limit.allowed) return createApiError("Too many requests", 429);

    const body = (await request.json()) as CartRequestBody;
    const key = String(body.key ?? "");
    const conversationId = String(body.conversationId ?? "");
    if (!key) return createApiError("Missing key", 400);
    if (!CONVERSATION_ID.test(conversationId)) {
      return createApiError("Invalid conversation", 400);
    }

    const config = await resolveWidget(key);
    if (!config) return createApiError("Widget not found", 404);
    const currency = await tenantCurrency(config.tenantId);

    const cart = await ensureCart({
      tenantId: config.tenantId,
      conversationId,
      channel: "web",
      customerReference: String(body.visitorId ?? conversationId),
    });

    const operation = body.operation ?? "add";

    if (operation === "checkout") {
      const name = String(body.customerName ?? "").trim();
      if (name.length < 2) {
        return createApiError("Please enter your name", 400);
      }
      const phone = normalizePhone(String(body.customerPhone ?? ""));
      if (!phone.ok) {
        return createApiError(phone.error ?? "Enter a valid phone number", 400);
      }
      const fulfilmentType = body.fulfilmentType === "pickup" ? "pickup" : "delivery";
      const address = String(body.address ?? "").trim();
      if (fulfilmentType === "delivery" && address.length < 8) {
        return createApiError(
          "Please add your area and house or street number",
          400
        );
      }
      if ((cart.items ?? []).length === 0) {
        return createApiError("Your cart is empty", 400);
      }

      const idempotencyKey = String(body.idempotencyKey ?? "").trim();
      if (idempotencyKey && !/^[a-zA-Z0-9_-]{8,64}$/.test(idempotencyKey)) {
        return createApiError("Invalid checkout request", 400);
      }

      // A fresh server quote is required before the order is placed; the
      // server also derives a deterministic idempotency key from the cart
      // revision, so a repeated submit returns the same order.
      const quoted = await quoteCart({
        tenantId: config.tenantId,
        cartId: cart.cartId,
        currency,
      });

      const result = await submitCart({
        tenantId: config.tenantId,
        cartId: cart.cartId,
        channel: "web",
        currency,
        customerName: name,
        customerPhone: phone.normalized,
        address: fulfilmentType === "delivery" ? address : undefined,
        notes: typeof body.notes === "string" ? body.notes.slice(0, 300) : undefined,
      });

      const trackingToken = createTrackingToken(config.tenantId, result.orderId);
      const trackUrl = `/track?key=${encodeURIComponent(key)}&token=${encodeURIComponent(trackingToken)}`;

      return createApiResponse({
        order: {
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          totalLabel: result.totalLabel,
          fulfilmentType,
          address: fulfilmentType === "delivery" ? address : null,
          trackUrl,
          status: "received",
          duplicate: result.duplicate,
        },
      });
    }

    if (operation === "clear") {
      await updateCart({
        tenantId: config.tenantId,
        cartId: cart.cartId,
        operation: "clear",
      });
    } else {
      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) {
        return createApiError("No items supplied", 400);
      }
      await updateCart({
        tenantId: config.tenantId,
        cartId: cart.cartId,
        operation,
        items: items.map((item) => ({
          itemId: String(item.itemId ?? ""),
          quantity: Number(item.quantity ?? 0),
          selections: normalizeSelections(item.selections),
        })),
        customerName:
          typeof body.customerName === "string" ? body.customerName : undefined,
        customerPhone:
          typeof body.customerPhone === "string" ? body.customerPhone : undefined,
        fulfilmentType:
          body.fulfilmentType === "pickup" ? "pickup" : "delivery",
        address: typeof body.address === "string" ? body.address : undefined,
        notes: typeof body.notes === "string" ? body.notes : undefined,
        currency: currency,
      });
    }

    const updated = await quoteCart({
      tenantId: config.tenantId,
      cartId: cart.cartId,
      currency: currency,
    }).catch(() => null);

    return createApiResponse(
      cartPayload(
        updated?.cart ?? cart,
        updated?.quote ?? null,
        currency
      )
    );
  } catch (error: unknown) {
    return handleApiError("api/widget/cart", error);
  }
}
