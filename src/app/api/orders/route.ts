import { tenantCollection, tenantDoc, requireTenantScope } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import type { OrderStatus } from "@/lib/services/orders";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ORDER_STATUSES: OrderStatus[] = [
  "received",
  "confirmed",
  "preparing",
  "ready",
  "dispatched",
  "completed",
  "declined",
  "cancelled",
];
const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"] as const;

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const tenantId = new URL(request.url).searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    await requireTenantScope(tenantId, session.uid, "orders");

    const snap = await tenantCollection(tenantId, "orders")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    // Carts that are still in progress (customer is deciding or waiting for
    // confirmation) so staff can follow up.
    const cartsSnap = await tenantCollection(tenantId, "carts")
      .where("status", "in", ["active", "awaiting_confirmation"])
      .get();
    const carts = cartsSnap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          cartId: d.cartId || doc.id,
          conversationId: d.conversationId,
          channel: d.channel,
          status: d.status,
          items: d.items ?? [],
          cartRevision: d.cartRevision ?? 0,
          totalLabel: d.currentQuote?.totalLabel ?? null,
          totalMinor: d.currentQuote?.totalMinor ?? null,
          fulfilment: d.fulfilment ?? null,
          customer: d.customer ?? null,
          updatedAt: d.updatedAt,
          expiresAt: d.expiresAt,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt as Date).getTime() -
          new Date(a.updatedAt as Date).getTime()
      );

    const orders = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        orderId: d.orderId || doc.id,
        orderNumber: d.orderNumber,
        channel: d.channel,
        status: d.status,
        paymentStatus: d.paymentStatus,
        items: d.items ?? [],
        totalMinor: d.totalMinor ?? 0,
        subtotalMinor: d.subtotalMinor ?? 0,
        discountMinor: d.discountMinor ?? 0,
        deliveryFeeMinor: d.deliveryFeeMinor ?? 0,
        currency: d.currency ?? "PKR",
        appliedOffer: d.appliedOffer ?? null,
        customer: d.customer ?? {},
        fulfilment: d.fulfilment ?? {},
        notes: d.notes,
        createdAt: d.createdAt,
      };
    });

    return createApiResponse({ orders, carts });
  } catch (error: unknown) {
    return handleApiError("api/orders", error);
  }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = await request.json();
    const { tenantId, orderId, status, paymentStatus } = body;
    if (!tenantId || !orderId) {
      return createApiError("Missing tenantId or orderId", 400);
    }

    await requireTenantScope(tenantId, session.uid, "orders");

    const update: Record<string, unknown> = { updatedAt: new Date() };

    if (status !== undefined) {
      if (!ORDER_STATUSES.includes(status)) {
        return createApiError("Invalid status", 400);
      }
      update.status = status;
    }
    if (paymentStatus !== undefined) {
      if (!PAYMENT_STATUSES.includes(paymentStatus)) {
        return createApiError("Invalid payment status", 400);
      }
      update.paymentStatus = paymentStatus;
    }

    await tenantDoc(tenantId, "orders", orderId).set(update, { merge: true });

    return createApiResponse({ orderId, status, paymentStatus });
  } catch (error: unknown) {
    return handleApiError("api/orders", error);
  }
}
