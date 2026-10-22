import { tenantCollection, tenantDoc, requireTenantScope } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import {
  allowedTransitions,
  checkTransition,
  isOrderStatus,
  isPaymentStatus,
  type OrderStatus,
} from "@/lib/domain/order-status";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

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
      const fulfilmentType = (
        d.fulfilment?.type === "pickup" ? "pickup" : "delivery"
      ) as "delivery" | "pickup";
      const status = (d.status ?? "received") as OrderStatus;
      return {
        orderId: d.orderId || doc.id,
        orderNumber: d.orderNumber,
        channel: d.channel,
        status,
        paymentStatus: d.paymentStatus,
        // The dashboard only offers transitions the server will accept.
        allowedNext: allowedTransitions(status, fulfilmentType),
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
        statusHistory: d.statusHistory ?? [],
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

    const ctx = await requireTenantScope(tenantId, session.uid, "orders");

    // Payment changes need a stronger role than fulfilment changes.
    if (paymentStatus !== undefined) {
      await requireTenantScope(tenantId, session.uid, "manage");
    }

    const orderRef = tenantDoc(tenantId, "orders", orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return createApiError("Order not found", 404);
    }
    const order = orderSnap.data() ?? {};
    const fulfilmentType = (
      order.fulfilment?.type === "pickup" ? "pickup" : "delivery"
    ) as "delivery" | "pickup";
    const currentStatus = (order.status ?? "received") as OrderStatus;

    const update: Record<string, unknown> = { updatedAt: new Date() };

    if (status !== undefined) {
      if (!isOrderStatus(status)) {
        return createApiError("Invalid status", 400);
      }
      const transition = checkTransition(currentStatus, status, fulfilmentType);
      if (!transition.ok) {
        return createApiError(
          transition.error ?? "That status change is not allowed",
          409,
          "INVALID_TRANSITION"
        );
      }
      update.status = status;
      update.statusHistory = [
        ...((order.statusHistory as Array<Record<string, unknown>>) ?? []),
        {
          from: currentStatus,
          to: status,
          by: session.uid,
          at: new Date().toISOString(),
        },
      ];
    }

    if (paymentStatus !== undefined) {
      if (!isPaymentStatus(paymentStatus)) {
        return createApiError("Invalid payment status", 400);
      }
      update.paymentStatus = paymentStatus;
      update.paymentHistory = [
        ...((order.paymentHistory as Array<Record<string, unknown>>) ?? []),
        {
          from: order.paymentStatus ?? "unpaid",
          to: paymentStatus,
          by: session.uid,
          at: new Date().toISOString(),
        },
      ];
    }

    await orderRef.set(update, { merge: true });

    return createApiResponse({
      orderId,
      status: update.status ?? currentStatus,
      paymentStatus: update.paymentStatus ?? order.paymentStatus ?? "unpaid",
      allowedNext: allowedTransitions(
        (update.status ?? currentStatus) as OrderStatus,
        fulfilmentType
      ),
    });
  } catch (error: unknown) {
    return handleApiError("api/orders", error);
  }
}
