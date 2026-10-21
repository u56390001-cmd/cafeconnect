import {
  requireTenantScope,
  tenantCollection,
  tenantDoc,
} from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const OFFER_TYPES = ["percentage", "fixedDiscount", "freeDelivery"] as const;
const STATUSES = ["draft", "active", "paused"] as const;
type OfferType = (typeof OFFER_TYPES)[number];
type OfferStatus = (typeof STATUSES)[number];

function normalizeDates(startAt?: unknown, endAt?: unknown) {
  const start = typeof startAt === "string" && startAt ? new Date(startAt) : null;
  const end = typeof endAt === "string" && endAt ? new Date(endAt) : null;
  if ((startAt && !start) || (endAt && !end)) return null;
  if (start && end && start >= end) return null;
  return { start, end };
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const tenantId = new URL(request.url).searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    const ctx = await requireTenantScope(tenantId, session.uid, "member");

    const snap = await tenantCollection(ctx.tenantId, "offers").get();
    const offers = snap.docs.sort(
      (a, b) =>
        new Date(b.data().createdAt as Date).getTime() -
        new Date(a.data().createdAt as Date).getTime()
    ).map((doc) => {
      const d = doc.data();
      return {
        offerId: d.offerId || doc.id,
        name: d.name,
        description: d.description || "",
        type: d.type,
        valuePct: d.valuePct ?? null,
        valueMinor: d.valueMinor ?? null,
        minOrderMinor: d.minOrderMinor ?? null,
        scopeCategoryIds: d.scopeCategoryIds ?? [],
        status: d.status,
        startAt: d.startAt ?? null,
        endAt: d.endAt ?? null,
      };
    });

    return createApiResponse({ offers });
  } catch (error: unknown) {
    return handleApiError("api/offers", error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = await request.json();
    const { tenantId, name, description, type, value, minOrder, status, startAt, endAt, scopeCategoryIds } =
      body;

    if (!tenantId) return createApiError("Missing tenantId", 400);
    if (typeof name !== "string" || !name.trim() || name.length > 100) {
      return createApiError("Invalid offer name", 400);
    }
    if (!OFFER_TYPES.includes(type)) {
      return createApiError("Invalid offer type", 400);
    }
    if (!STATUSES.includes(status)) {
      return createApiError("Invalid status", 400);
    }

    const dates = normalizeDates(startAt, endAt);
    if (startAt && endAt && !dates) {
      return createApiError("Invalid date range", 400);
    }

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");

    let valuePct: number | null = null;
    let valueMinor: number | null = null;
    if (type === "percentage") {
      if (typeof value !== "number" || value <= 0 || value > 90) {
        return createApiError("Percentage must be 1-90", 400);
      }
      valuePct = value;
    } else if (type === "fixedDiscount") {
      if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        return createApiError("Invalid discount amount", 400);
      }
      valueMinor = value;
    }

    const docRef = tenantCollection(ctx.tenantId, "offers").doc();
    await docRef.set({
      offerId: docRef.id,
      tenantId: ctx.tenantId,
      name: name.trim(),
      description: typeof description === "string" ? description.slice(0, 500) : "",
      type: type as OfferType,
      valuePct,
      valueMinor,
      minOrderMinor:
        typeof minOrder === "number" && Number.isInteger(minOrder) && minOrder >= 0
          ? minOrder
          : null,
      // Optional scope: the discount only applies to these categories.
      scopeCategoryIds: Array.isArray(scopeCategoryIds)
        ? scopeCategoryIds
            .filter((id: unknown): id is string => typeof id === "string")
            .slice(0, 20)
        : [],
      stackable: false,
      status: status as OfferStatus,
      startAt: dates?.start ?? null,
      endAt: dates?.end ?? null,
      createdBy: ctx.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return createApiResponse({ offerId: docRef.id }, 201);
  } catch (error: unknown) {
    return handleApiError("api/offers", error);
  }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { tenantId, offerId, status } = await request.json();
    if (!tenantId || !offerId) {
      return createApiError("Missing tenantId or offerId", 400);
    }
    if (!STATUSES.includes(status)) {
      return createApiError("Invalid status", 400);
    }

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");

    await tenantDoc(ctx.tenantId, "offers", offerId).set(
      { status, updatedAt: new Date() },
      { merge: true }
    );

    return createApiResponse({ offerId, status });
  } catch (error: unknown) {
    return handleApiError("api/offers", error);
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const offerId = searchParams.get("offerId");
    if (!tenantId || !offerId) {
      return createApiError("Missing tenantId or offerId", 400);
    }

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");
    await tenantDoc(ctx.tenantId, "offers", offerId).delete();

    return createApiResponse({ deleted: offerId });
  } catch (error: unknown) {
    return handleApiError("api/offers", error);
  }
}
