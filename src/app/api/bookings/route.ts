import { tenantCollection, tenantDoc, requireTenantScope } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const BOOKING_STATUSES = ["pending", "confirmed", "cancelled", "completed"] as const;
type BookingStatus = (typeof BOOKING_STATUSES)[number];

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const tenantId = new URL(request.url).searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    await requireTenantScope(tenantId, session.uid, "member");

    const snap = await tenantCollection(tenantId, "bookings")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    const bookings = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        bookingId: d.bookingId || doc.id,
        type: d.type,
        customerName: d.customerName,
        phone: d.phone,
        date: d.date,
        time: d.time,
        partySize: d.partySize ?? null,
        notes: d.notes || "",
        status: d.status,
        createdAt: d.createdAt,
      };
    });

    return createApiResponse({ bookings });
  } catch (error: unknown) {
    return handleApiError("api/bookings", error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = await request.json();
    const { tenantId, date, time, customerName, phone, partySize, notes } = body;

    if (!tenantId) return createApiError("Missing tenantId", 400);
    if (typeof customerName !== "string" || !customerName.trim() || customerName.length > 100) {
      return createApiError("Invalid customer name", 400);
    }
    if (typeof phone !== "string" || !/^[+\d][\d\s-]{6,15}$/.test(phone)) {
      return createApiError("Invalid phone number", 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return createApiError("Invalid date or time", 400);
    }
    if (
      !Number.isInteger(partySize) ||
      partySize < 1 ||
      partySize > 50
    ) {
      return createApiError("Invalid party size", 400);
    }

    await requireTenantScope(tenantId, session.uid, "manage");

    const docRef = tenantCollection(tenantId, "bookings").doc();
    await docRef.set({
      bookingId: docRef.id,
      tenantId,
      type: "table",
      customerName: customerName.trim(),
      phone,
      date,
      time,
      partySize,
      notes: typeof notes === "string" ? notes.slice(0, 500) : "",
      status: "pending" as BookingStatus,
      branchId: null,
      createdBy: session.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return createApiResponse({ bookingId: docRef.id }, 201);
  } catch (error: unknown) {
    return handleApiError("api/bookings", error);
  }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { tenantId, bookingId, status } = await request.json();
    if (!tenantId || !bookingId) {
      return createApiError("Missing tenantId or bookingId", 400);
    }
    if (!BOOKING_STATUSES.includes(status)) {
      return createApiError("Invalid status", 400);
    }

    await requireTenantScope(tenantId, session.uid, "manage");

    await tenantDoc(tenantId, "bookings", bookingId).set(
      { status, updatedAt: new Date() },
      { merge: true }
    );

    return createApiResponse({ bookingId, status });
  } catch (error: unknown) {
    return handleApiError("api/bookings", error);
  }
}
