import { tenantCollection, tenantDoc, requireTenantScope } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const tenantId = new URL(request.url).searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    await requireTenantScope(tenantId, session.uid, "member");

    const [itemsSnap, ordersSnap, conversationsSnap, bookingsSnap, profileSnap] =
      await Promise.all([
        tenantCollection(tenantId, "menuItems")
          .where("publicationStatus", "==", "published")
          .get(),
        tenantCollection(tenantId, "orders").orderBy("createdAt", "desc").limit(100).get(),
        tenantCollection(tenantId, "conversations").get(),
        tenantCollection(tenantId, "bookings").get(),
        tenantDoc(tenantId, "profile", "main").get(),
      ]);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const orders = ordersSnap.docs.map((doc) => doc.data());
    const activeOrders = orders.filter(
      (o) => !["completed", "cancelled", "declined"].includes(o.status)
    ).length;
    const ordersToday = orders.filter(
      (o) => new Date(o.createdAt as Date).getTime() >= startOfToday.getTime()
    ).length;
    const revenueToday = orders
      .filter(
        (o) =>
          new Date(o.createdAt as Date).getTime() >= startOfToday.getTime() &&
          o.paymentStatus === "paid"
      )
      .reduce((sum, o) => sum + Number(o.totalMinor ?? 0), 0);

    const openConversations = conversationsSnap.docs.filter(
      (doc) => doc.data().status === "open" || doc.data().status === "waitingForHuman"
    ).length;

    const upcomingBookings = bookingsSnap.docs.filter(
      (doc) => doc.data().status === "pending" || doc.data().status === "confirmed"
    ).length;

    const profile = profileSnap.data();

    return createApiResponse({
      businessName: profile?.businessName ?? "",
      currency: profile?.currency ?? "PKR",
      publishedItems: itemsSnap.size,
      activeOrders,
      ordersToday,
      revenuePaidTodayMinor: revenueToday,
      openConversations,
      upcomingBookings,
    });
  } catch (error: unknown) {
    return handleApiError("api/overview", error);
  }
}
