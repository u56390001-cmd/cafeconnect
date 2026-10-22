import { NextRequest } from "next/server";
import {
  requireTenantScope,
  tenantCollection,
  tenantDoc,
} from "@/lib/tenancy/resolver";
import { getAdminDb } from "@/lib/firebase/admin";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import {
  createOrder,
  OrderError,
  type OrderItemInput,
} from "@/lib/services/orders";
import { normalizeSelections } from "@/lib/services/carts";
import { checkTransition, type FulfilmentType, type OrderStatus } from "@/lib/domain/order-status";
import { normalizePhone } from "@/lib/domain/phone";
import { formatMoney } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

/**
 * Point of sale order taking.
 *
 * The POS never calculates a price itself: it hands the lines to the shared
 * order service, which validates the menu, the options, the offers, the
 * minimum order and the delivery area, and returns the authoritative totals.
 * Payment is recorded separately from fulfilment and needs a manager, the
 * same rule the order hub applies.
 */

interface PosOrderBody {
  tenantId?: string;
  action?: "kot" | "bill";
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
  paymentMethod?: string;
  idempotencyKey?: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = (await request.json()) as PosOrderBody;
    if (!body.tenantId) return createApiError("Missing tenantId", 400);
    if (!body.items || body.items.length === 0) {
      return createApiError("Add at least one item", 400);
    }
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(String(body.idempotencyKey ?? ""))) {
      return createApiError("Invalid request id", 400);
    }

    const ctx = await requireTenantScope(body.tenantId, session.uid, "orders");

    const name = String(body.customerName ?? "").trim();
    if (name.length < 2) {
      return createApiError("Enter the customer name", 400);
    }
    const phone = normalizePhone(String(body.customerPhone ?? ""));
    if (!phone.ok) {
      return createApiError(phone.error ?? "Enter a valid phone number", 400);
    }
    const fulfilmentType = body.fulfilmentType === "delivery" ? "delivery" : "pickup";
    const address = String(body.address ?? "").trim();
    if (fulfilmentType === "delivery" && address.length < 8) {
      return createApiError(
        "Add the delivery address (area and house or street number)",
        400
      );
    }

    const items: OrderItemInput[] = body.items.map((item) => ({
      itemId: String(item.itemId ?? ""),
      quantity: Number(item.quantity ?? 0),
      selections: normalizeSelections(item.selections),
      note: typeof item.note === "string" ? item.note.slice(0, 200) : undefined,
    }));

    const result = await createOrder({
      tenantId: ctx.tenantId,
      items,
      customerName: name,
      customerPhone: phone.normalized,
      fulfilmentType,
      address: fulfilmentType === "delivery" ? address : undefined,
      notes:
        typeof body.notes === "string" && body.notes.trim().length > 0
          ? body.notes.trim().slice(0, 300)
          : undefined,
      idempotencyKey: String(body.idempotencyKey),
      channel: "pos",
    });

    // Kitchen ticket: the order is confirmed and sent to the kitchen. Both
    // transitions are legal from "received" and are validated server side.
    if (body.action === "kot") {
      await advanceStatus(ctx.tenantId, result.orderId, "confirmed");
      await advanceStatus(ctx.tenantId, result.orderId, "preparing");
    }

    // Payment is a separate concern and needs a manager, exactly like in the
    // order hub. Staff without that role still get the order created.
    let paymentRecorded = false;
    let paymentError: string | null = null;
    const paymentMethod = String(body.paymentMethod ?? "").trim();
    if (body.action === "bill" && paymentMethod) {
      const canCollectPayment = await canManage(ctx.tenantId, session.uid);
      if (canCollectPayment) {
        // KOT advances the status first; a fresh read keeps the history append
        // correct even in that interleaving.
        const beforePayment =
          (await tenantDoc(ctx.tenantId, "orders", result.orderId).get()).data() ?? {};
        await tenantDoc(ctx.tenantId, "orders", result.orderId).set(
          {
            paymentStatus: "paid",
            paymentMethod: paymentMethod.slice(0, 40),
            paymentHistory: [
              ...((beforePayment.paymentHistory as Array<Record<string, unknown>>) ?? []),
              {
                from: beforePayment.paymentStatus ?? "unpaid",
                to: "paid",
                method: paymentMethod.slice(0, 40),
                by: session.uid,
                at: new Date().toISOString(),
              },
            ],
            updatedAt: new Date(),
          },
          { merge: true }
        );
        paymentRecorded = true;
      } else {
        paymentError =
          "The order was created. A manager has to confirm the payment.";
      }
    }

    const orderSnap = await tenantDoc(ctx.tenantId, "orders", result.orderId).get();
    const order = orderSnap.data() ?? {};
    const currency = String(order.currency ?? "PKR");
    const businessName = String(
      (await getBusinessName(ctx.tenantId)) ?? ""
    );

    return createApiResponse({
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      duplicate: result.duplicate,
      status: String(order.status ?? "received"),
      paymentStatus: String(order.paymentStatus ?? "unpaid"),
      paymentRecorded,
      paymentError,
      fulfilmentType,
      address: fulfilmentType === "delivery" ? address : null,
      businessName,
      createdAt: String(order.createdAt ?? new Date().toISOString()),
      notes: typeof order.notes === "string" ? order.notes : "",
      paymentMethod:
        typeof (order as Record<string, unknown>).paymentMethod === "string"
          ? ((order as Record<string, unknown>).paymentMethod as string)
          : null,
      items: order.items ?? [],
      pricing: {
        subtotalMinor: result.pricing.subtotalMinor,
        discountMinor: result.pricing.discountMinor,
        deliveryFeeMinor: result.pricing.deliveryFeeMinor,
        totalMinor: result.pricing.totalMinor,
        subtotalLabel: formatMoney(result.pricing.subtotalMinor, currency),
        discountLabel: formatMoney(result.pricing.discountMinor, currency),
        deliveryFeeLabel: formatMoney(result.pricing.deliveryFeeMinor, currency),
        totalLabel: formatMoney(result.pricing.totalMinor, currency),
      },
      appliedOffer: result.pricing.appliedOfferName,
    });
  } catch (error: unknown) {
    if (error instanceof OrderError) {
      const status = error.code === "ITEM_NOT_FOUND" ? 404 : 400;
      return createApiError(error.message, status, error.code);
    }
    return handleApiError("api/pos/orders", error);
  }
}

/** Moves an order one legal step forward, ignoring impossible steps. */
async function advanceStatus(
  tenantId: string,
  orderId: string,
  next: "confirmed" | "preparing"
): Promise<void> {
  const ref = tenantDoc(tenantId, "orders", orderId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const order = snap.data() ?? {};
  const current = String(order.status ?? "received") as OrderStatus;
  const fulfilmentType: FulfilmentType =
    order.fulfilment?.type === "pickup" ? "pickup" : "delivery";
  const transition = checkTransition(current, next, fulfilmentType);
  if (!transition.ok) return;
  await ref.set(
    {
      status: next,
      statusHistory: [
        ...((order.statusHistory as Array<Record<string, unknown>>) ?? []),
        { from: current, to: next, by: "pos", at: new Date().toISOString() },
      ],
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

/** A manager (or above) may record a payment. */
async function canManage(tenantId: string, uid: string): Promise<boolean> {
  try {
    await requireTenantScope(tenantId, uid, "manage");
    return true;
  } catch {
    return false;
  }
}

/** Business display name stored on the tenant document. */
async function getBusinessName(tenantId: string): Promise<string | null> {
  try {
    const snap = await getAdminDb().collection("tenants").doc(tenantId).get();
    const name = snap.data()?.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

/** Recent POS orders, used by the "search in existing" field. */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const tenantId = new URL(request.url).searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    const ctx = await requireTenantScope(tenantId, session.uid, "orders");

    const [ordersSnap, profileSnap, deliverySnap] = await Promise.all([
      tenantCollection(ctx.tenantId, "orders")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get(),
      tenantDoc(ctx.tenantId, "profile", "main").get(),
      tenantDoc(ctx.tenantId, "settings", "delivery").get(),
    ]);

    const profile = profileSnap.data() ?? {};
    const delivery = deliverySnap.data() ?? {};
    const settings = {
      businessName: String(profile.businessName ?? ""),
      currency: String(profile.currency ?? "PKR"),
      pickupAvailable: delivery.pickupAvailable !== false,
      paymentMethods: String(delivery.paymentMethods ?? "Cash on delivery"),
    };

    const orders = ordersSnap.docs
      .filter((doc) => doc.data().channel === "pos")
      .map((doc) => {
        const d = doc.data();
        return {
          orderId: d.orderId || doc.id,
          orderNumber: d.orderNumber,
          status: d.status ?? "received",
          paymentStatus: d.paymentStatus ?? "unpaid",
          customer: d.customer ?? {},
          items: d.items ?? [],
          totalMinor: d.totalMinor ?? 0,
          currency: d.currency ?? "PKR",
          createdAt: d.createdAt,
        };
      });

    return createApiResponse({
      orders,
      settings,
      canCollectPayment: await canManage(ctx.tenantId, session.uid),
    });
  } catch (error: unknown) {
    return handleApiError("api/pos/orders", error);
  }
}
