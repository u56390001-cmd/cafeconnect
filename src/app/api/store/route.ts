import { resolveWidget, checkRateLimit } from "@/lib/widget/service";
import { checkSharedRateLimit } from "@/lib/security/rate-limit";
import { createOrder, type OrderItemInput } from "@/lib/services/orders";
import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const key = new URL(request.url).searchParams.get("key");
    if (!key) return createApiError("Missing key", 400);
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const memoryAllowed = checkRateLimit(`store:${ip}`);
    const limit = await checkSharedRateLimit("store-catalog", 60, memoryAllowed);
    if (!limit.allowed) return createApiError("Too many requests", 429);

    const config = await resolveWidget(key);
    if (!config || !config.allowStore) {
      return createApiError("Store not found", 404);
    }

    const [profileSnap, categoriesSnap, itemsSnap, offersSnap, deliverySnap] =
      await Promise.all([
        tenantDoc(config.tenantId, "profile", "main").get(),
        tenantCollection(config.tenantId, "menuCategories")
          .where("status", "==", "active")
          .get(),
        tenantCollection(config.tenantId, "menuItems")
          .where("publicationStatus", "==", "published")
          .get(),
        tenantCollection(config.tenantId, "offers")
          .where("status", "==", "active")
          .get(),
        tenantDoc(config.tenantId, "settings", "delivery").get(),
      ]);

    const profileData = profileSnap.data();
    if (!profileData) return createApiError("Store not available", 404);

    const activeCategories = new Set<string>();
    const categories = categoriesSnap.docs
      .sort((a, b) => (a.data().sortOrder ?? 0) - (b.data().sortOrder ?? 0))
      .map((doc) => {
        const d = doc.data();
        activeCategories.add(d.categoryId || doc.id);
        return {
          categoryId: d.categoryId || doc.id,
          name: d.name,
        };
      });

    const now = Date.now();
    const activeOffers = offersSnap.docs
      .filter((doc) => {
        const d = doc.data();
        const start = d.startAt ? new Date(d.startAt as Date).getTime() : 0;
        const end = d.endAt ? new Date(d.endAt as Date).getTime() : 0;
        return (!start || start <= now) && (!end || end >= now);
      })
      .map((doc) => {
        const d = doc.data();
        return {
          offerId: d.offerId || doc.id,
          name: d.name,
          description: d.description || "",
          type: d.type,
          valueLabel:
            d.type === "percentage"
              ? `${d.valuePct}% off`
              : d.type === "fixedDiscount"
                ? `${Math.round(Number(d.valueMinor ?? 0) / 100)} off`
                : "Free delivery",
          minOrderMinor: d.minOrderMinor ?? null,
        };
      });

    const items = itemsSnap.docs
      .filter((doc) => {
        const d = doc.data();
        const price = Number(d.basePriceMinor ?? 0);
        return (
          activeCategories.has(d.categoryId) &&
          d.availability === "available" &&
          price > 0
        );
      })
      // The restaurant's own order is the public order.
      .sort((a, b) => {
        const aOrder = Number(a.data().sortOrder ?? 0);
        const bOrder = Number(b.data().sortOrder ?? 0);
        if (aOrder !== bOrder) return aOrder - bOrder;
        return String(a.data().name ?? "").localeCompare(
          String(b.data().name ?? "")
        );
      })
      .map((doc) => {
        const d = doc.data();
        return {
          itemId: d.itemId || doc.id,
          categoryId: d.categoryId,
          name: d.name,
          description: d.description || "",
          priceMinor: Number(d.basePriceMinor),
          imageReferences: d.imageReferences ?? [],
          spiceLevel: d.spiceLevel ?? "",
          dietaryLabels: d.dietaryLabels ?? [],
          portion: d.portion ?? "",
        };
      });

    return createApiResponse({
      businessName: profileData.businessName,
      currency: profileData.currency ?? "PKR",
      categories,
      items,
      offers: activeOffers,
      deliveryFeeMinor: Number(deliverySnap.data()?.deliveryFeeMinor ?? 0),
      // Checkout transparency: the customer sees the rules before submitting.
      minimumOrderMinor: Number(deliverySnap.data()?.minimumOrderMinor ?? 0),
      pickupAvailable: deliverySnap.data()?.pickupAvailable !== false,
      paymentMethods: deliverySnap.data()?.paymentMethods ?? "Cash on delivery",
      deliveryAreaLabel: deliverySnap.data()?.deliveryArea ?? null,
      orderInstructions: deliverySnap.data()?.orderInstructions ?? null,
      city: profileData.address ?? null,
    });
  } catch (error: unknown) {
    return handleApiError("api/store", error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const memoryAllowed = checkRateLimit(`storeorder:${ip}`);
    const limit = await checkSharedRateLimit("store-order", 10, memoryAllowed);
    if (!limit.allowed) {
      return createApiError("Too many requests", 429);
    }

    const body = await request.json();
    const { key, items, customerName, customerPhone, fulfilmentType, address, notes, idempotencyKey } =
      body;

    if (!key) return createApiError("Missing key", 400);
    const config = await resolveWidget(key);
    if (!config || !config.allowStore) {
      return createApiError("Store not found", 404);
    }

    const validItems: OrderItemInput[] = Array.isArray(items)
      ? items.map((i: { itemId?: unknown; quantity?: unknown }) => ({
          itemId: String(i.itemId ?? ""),
          quantity: Number(i.quantity ?? 0),
        }))
      : [];

    const validated = {
      items: validItems,
      customerName: String(customerName ?? ""),
      customerPhone: String(customerPhone ?? ""),
      fulfilmentType: fulfilmentType === "pickup" ? ("pickup" as const) : ("delivery" as const),
      address: typeof address === "string" ? address : undefined,
      notes: typeof notes === "string" ? notes : undefined,
      idempotencyKey: String(idempotencyKey ?? ""),
      channel: "web",
    };

    try {
      const result = await createOrder({
        tenantId: config.tenantId,
        ...validated,
      });

      // A signed, high-entropy tracking token for the customer.
      const { createTrackingToken } = await import("@/lib/tracking/token");
      const trackingToken = createTrackingToken(config.tenantId, result.orderId);

      return createApiResponse(
        {
          orderNumber: result.orderNumber,
          totalMinor: result.pricing.totalMinor,
          discountMinor: result.pricing.discountMinor,
          appliedOffer: result.pricing.appliedOfferName,
          duplicate: result.duplicate,
          trackingToken,
          trackUrl: `/track?key=${encodeURIComponent(key)}&token=${encodeURIComponent(
            trackingToken
          )}`,
        },
        201
      );
    } catch (orderError: unknown) {
      const message =
        orderError instanceof Error ? orderError.message : "Order failed";
      return createApiError(sanitizeStoreError(message), 400);
    }
  } catch (error: unknown) {
    return handleApiError("api/store", error);
  }
}

function sanitizeStoreError(message: string): string {
  if (/Missing tenant|Invalid order items|Invalid quantity|Invalid item id/.test(message))
    return "Invalid order request";
  if (/Invalid customer name/.test(message)) return "Please enter a valid name";
  if (/Invalid customer phone/.test(message)) return "Please enter a valid phone number";
  if (/Valid address required/.test(message)) return "Please enter your delivery address";
  if (/Invalid idempotency key/.test(message)) return "Invalid order request";
  if (/Menu item not found|not available/.test(message)) return "An item is no longer available. Please refresh and try again";
  return message;
}
