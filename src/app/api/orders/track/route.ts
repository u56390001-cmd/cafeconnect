import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyTrackingToken } from "@/lib/tracking/token";
import { checkRateLimit } from "@/lib/widget/service";
import { checkSharedRateLimit } from "@/lib/security/rate-limit";
import { formatMoney } from "@/lib/domain/money";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public, privacy-safe order tracking.
 *
 * The customer proves ownership with a signed tracking token (issued when the
 * order was created). Only customer-safe fields are returned; staff notes,
 * full phone numbers and internal settings never leave the server. Invalid and
 * cross-tenant attempts return the same generic answer.
 */

const TRACKING_STEPS = [
  { key: "received", label: "Received" },
  { key: "confirmed", label: "Confirmed" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "dispatched", label: "Out for delivery" },
  { key: "completed", label: "Completed" },
];

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const memoryAllowed = checkRateLimit(`track:${ip}`);
    const limit = await checkSharedRateLimit("order-tracking", 30, memoryAllowed);
    if (!limit.allowed) {
      return createApiError("Too many requests. Please wait a moment.", 429);
    }

    const params = new URL(request.url).searchParams;
    const key = params.get("key") ?? "";
    const token = params.get("token") ?? "";

    if (!key || !token) {
      return createApiError("Tracking link is not valid.", 400);
    }

    // The key resolves the tenant (the widget/store key) and the token is
    // bound to that same tenant.
    const { resolveWidget } = await import("@/lib/widget/service");
    const config = await resolveWidget(key);
    if (!config) {
      return createApiError("We could not find that order.", 404);
    }

    const verified = verifyTrackingToken(token, config.tenantId);
    if (!verified) {
      // Generic failure: never reveal whether an order exists.
      return createApiError("We could not find that order.", 404);
    }

    const db = getAdminDb();
    const snap = await db
      .collection(`tenants/${config.tenantId}/orders`)
      .doc(verified.orderId)
      .get();
    if (!snap.exists) {
      return createApiError("We could not find that order.", 404);
    }

    const order = snap.data()!;
    const fulfilmentType = order.fulfilment?.type === "pickup" ? "pickup" : "delivery";
    const steps =
      fulfilmentType === "pickup"
        ? TRACKING_STEPS.filter((step) => step.key !== "dispatched")
        : TRACKING_STEPS;

    const currentStatus = String(order.status ?? "received");
    const currentIndex = steps.findIndex((step) => step.key === currentStatus);

    return createApiResponse({
      orderNumber: order.orderNumber,
      status: currentStatus,
      fulfilmentType,
      placedAt: order.createdAt ?? null,
      totalLabel: formatMoney(Number(order.totalMinor ?? 0), order.currency ?? "PKR"),
      itemCount: (order.items ?? []).reduce(
        (sum: number, item: { quantity?: number }) =>
          sum + Number(item.quantity ?? 0),
        0
      ),
      timeline: steps.map((step, index) => ({
        label: step.label,
        state:
          currentStatus === "cancelled" || currentStatus === "declined"
            ? index === 0
              ? "done"
              : "skipped"
            : index < currentIndex
              ? "done"
              : index === currentIndex
                ? "current"
                : "upcoming",
      })),
      cancelled: currentStatus === "cancelled" || currentStatus === "declined",
    });
  } catch (error: unknown) {
    return handleApiError("api/orders/track", error);
  }
}
