import {
  requireTenantScope,
  tenantCollection,
  tenantDoc,
} from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { invalidateAiContext } from "@/lib/ai/context-builder";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const AVAILABILITY = ["available", "soldOut", "paused"] as const;
const PUBLICATION = ["draft", "published"] as const;
type Availability = (typeof AVAILABILITY)[number];
type PublicationStatus = (typeof PUBLICATION)[number];

interface ItemPayload {
  itemId?: string;
  categoryId: string;
  name: string;
  description?: string;
  basePriceMinor: number;
  availability?: Availability;
  publicationStatus?: PublicationStatus;
}

function validatePayload(body: Partial<ItemPayload>): string | null {
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 120) {
    return "Invalid item name";
  }
  if (
    typeof body.basePriceMinor !== "number" ||
    !Number.isInteger(body.basePriceMinor) ||
    body.basePriceMinor < 0 ||
    body.basePriceMinor > 500_000_000
  ) {
    return "Invalid price";
  }
  if (typeof body.categoryId !== "string" || !body.categoryId) {
    return "Invalid category";
  }
  if (
    body.description !== undefined &&
    (typeof body.description !== "string" || body.description.length > 1000)
  ) {
    return "Invalid description";
  }
  return null;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const tenantId = new URL(request.url).searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    const ctx = await requireTenantScope(tenantId, session.uid, "member");

    const snap = await tenantCollection(ctx.tenantId, "menuItems").get();
    const items = snap.docs
      .filter((d) => d.data().status !== "archived")
      .sort(
        (a, b) =>
          String(a.data().name ?? "").localeCompare(String(b.data().name ?? ""))
      )
      .map((doc) => {
        const d = doc.data();
        return {
          itemId: d.itemId || doc.id,
          categoryId: d.categoryId,
          name: d.name,
          description: d.description || "",
          basePriceMinor: d.basePriceMinor ?? 0,
          availability: d.availability ?? "available",
          publicationStatus: d.publicationStatus ?? "draft",
          updatedAt: d.updatedAt,
        };
      });

    return createApiResponse({ items });
  } catch (error: unknown) {
    return handleApiError("api/menu/items", error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = (await request.json()) as Partial<ItemPayload> & {
      tenantId?: string;
    };
    if (!body.tenantId) return createApiError("Missing tenantId", 400);

    const err = validatePayload(body);
    if (err) return createApiError(err, 400);

    const tenantId: string = body.tenantId;
    const validated: ItemPayload = {
      itemId: undefined,
      categoryId: String(body.categoryId),
      name: String(body.name),
      description: typeof body.description === "string" ? body.description : undefined,
      basePriceMinor: Number(body.basePriceMinor),
    };
    const availability: Availability =
      body.availability && AVAILABILITY.includes(body.availability)
        ? body.availability
        : "available";
    const publicationStatus: PublicationStatus =
      body.publicationStatus && PUBLICATION.includes(body.publicationStatus)
        ? body.publicationStatus
        : "draft";

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");
    // verify category belongs to tenant
    const categorySnap = await tenantDoc(
      ctx.tenantId,
      "menuCategories",
      String(body.categoryId)
    ).get();
    if (!categorySnap.exists || categorySnap.data()?.status !== "active") {
      return createApiError("Category not found", 400);
    }

    const docRef = tenantCollection(ctx.tenantId, "menuItems").doc();
    await docRef.set({
      itemId: docRef.id,
      tenantId: ctx.tenantId,
      categoryId: validated.categoryId,
      name: validated.name.trim(),
      description: body.description?.trim() ?? "",
      basePriceMinor: body.basePriceMinor,
      availability,
      publicationStatus,
      imageReferences: [],
      branchId: null,
      status: "active",
      version: 1,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    invalidateAiContext(ctx.tenantId);

    return createApiResponse({ itemId: docRef.id }, 201);
  } catch (error: unknown) {
    return handleApiError("api/menu/items", error);
  }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = (await request.json()) as Partial<ItemPayload> & {
      tenantId?: string;
    };
    if (!body.tenantId || !body.itemId) {
      return createApiError("Missing tenantId or itemId", 400);
    }

    const update: Record<string, unknown> = { updatedAt: new Date(), updatedBy: session.uid };
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 120)
        return createApiError("Invalid item name", 400);
      update.name = body.name.trim();
    }
    if (body.description !== undefined) update.description = body.description.slice(0, 1000);
    if (body.categoryId !== undefined) {
      const categorySnap = await tenantDoc(
        body.tenantId,
        "menuCategories",
        body.categoryId
      ).get();
      if (!categorySnap.exists) return createApiError("Category not found", 400);
      update.categoryId = body.categoryId;
    }
    if (body.basePriceMinor !== undefined) {
      if (
        typeof body.basePriceMinor !== "number" ||
        !Number.isInteger(body.basePriceMinor) ||
        body.basePriceMinor < 0
      )
        return createApiError("Invalid price", 400);
      update.basePriceMinor = body.basePriceMinor;
    }
    if (body.availability !== undefined) {
      if (!AVAILABILITY.includes(body.availability))
        return createApiError("Invalid availability", 400);
      update.availability = body.availability;
    }
    if (body.publicationStatus !== undefined) {
      if (!PUBLICATION.includes(body.publicationStatus))
        return createApiError("Invalid publication status", 400);
      update.publicationStatus = body.publicationStatus;
    }

    const ctx = await requireTenantScope(body.tenantId, session.uid, "manage");

    await tenantDoc(ctx.tenantId, "menuItems", body.itemId).set(update, {
      merge: true,
    });

    invalidateAiContext(ctx.tenantId);

    return createApiResponse({ itemId: body.itemId });
  } catch (error: unknown) {
    return handleApiError("api/menu/items", error);
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const itemId = searchParams.get("itemId");
    if (!tenantId || !itemId) {
      return createApiError("Missing tenantId or itemId", 400);
    }

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");

    await tenantDoc(ctx.tenantId, "menuItems", itemId).set(
      {
        status: "archived",
        publicationStatus: "draft",
        availability: "paused",
        updatedAt: new Date(),
      },
      { merge: true }
    );

    invalidateAiContext(ctx.tenantId);

    return createApiResponse({ deleted: itemId });
  } catch (error: unknown) {
    return handleApiError("api/menu/items", error);
  }
}

