import { requireTenantScope as requireMember, tenantCollection } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { invalidateAiContext } from "@/lib/ai/context-builder";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const CATEGORIES = ["faq", "policy", "businessInfo", "document"] as const;
type Category = (typeof CATEGORIES)[number];

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    const ctx = await requireMember(tenantId, session.uid);

    const snap = await tenantCollection(ctx.tenantId, "knowledgeBase").get();

    const items = snap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          documentId: data.documentId,
          title: data.title,
          category: data.category,
          language: data.language,
          status: data.status,
          version: data.version,
          content: data.contentReference ?? "",
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt as Date).getTime() -
          new Date(a.updatedAt as Date).getTime()
      );

    return createApiResponse({ items });
  } catch (error: unknown) {
    return handleApiError("api/knowledge", error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { tenantId, title, category, content, language } = await request.json();

    if (!tenantId || !title || !category) {
      return createApiError("Missing required fields", 400);
    }
    if (!CATEGORIES.includes(category)) {
      return createApiError("Invalid category", 400);
    }
    if (typeof title !== "string" || title.length > 200 || !title.trim()) {
      return createApiError("Invalid title", 400);
    }
    if (typeof content !== "string" || content.length > 20000) {
      return createApiError("Content too long", 400);
    }

    const ctx = await requireMember(tenantId, session.uid);

    const docRef = tenantCollection(ctx.tenantId, "knowledgeBase").doc();
    await docRef.set({
      documentId: docRef.id,
      tenantId: ctx.tenantId,
      title: title.trim(),
      contentReference: content || "",
      category: category as Category,
      language: typeof language === "string" ? language : "en",
      branchId: null,
      sourceType: "manual",
      sourceReference: null,
      status: "published",
      version: 1,
      effectiveAt: new Date(),
      reviewAt: null,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    invalidateAiContext(ctx.tenantId);

    return createApiResponse({ documentId: docRef.id }, 201);
  } catch (error: unknown) {
    return handleApiError("api/knowledge", error);
  }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = (await request.json()) as {
      tenantId?: string;
      documentId?: string;
      title?: string;
      content?: string;
      category?: string;
      language?: string;
      status?: string;
    };
    if (!body.tenantId || !body.documentId) {
      return createApiError("Missing tenantId or documentId", 400);
    }
    if (
      body.category !== undefined &&
      !CATEGORIES.includes(body.category as Category)
    ) {
      return createApiError("Invalid category", 400);
    }
    if (
      body.status !== undefined &&
      !["published", "draft", "archived"].includes(body.status)
    ) {
      return createApiError("Invalid status", 400);
    }
    if (
      body.title !== undefined &&
      (!body.title.trim() || body.title.length > 200)
    ) {
      return createApiError("Invalid title", 400);
    }
    if (body.content !== undefined && body.content.length > 20000) {
      return createApiError("Content too long", 400);
    }

    const ctx = await requireMember(body.tenantId, session.uid);

    const docRef = tenantCollection(ctx.tenantId, "knowledgeBase").doc(
      body.documentId
    );
    const snap = await docRef.get();
    if (!snap.exists) {
      return createApiError("Knowledge entry not found", 404);
    }

    const update: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: session.uid,
    };
    if (body.title !== undefined) update.title = body.title.trim();
    if (body.content !== undefined) update.contentReference = body.content;
    if (body.category !== undefined) update.category = body.category;
    if (body.language !== undefined) update.language = body.language;
    if (body.status !== undefined) update.status = body.status;

    await docRef.set(update, { merge: true });

    // The AI context is cached - drop it so the new fact is used right away.
    const { invalidateAiContext } = await import("@/lib/ai/context-builder");
    invalidateAiContext(ctx.tenantId);

    return createApiResponse({ documentId: body.documentId, updated: true });
  } catch (error: unknown) {
    return handleApiError("api/knowledge", error);
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const documentId = searchParams.get("documentId");
    if (!tenantId || !documentId) {
      return createApiError("Missing tenantId or documentId", 400);
    }

    const ctx = await requireMember(tenantId, session.uid);

    const docRef = tenantCollection(ctx.tenantId, "knowledgeBase").doc(documentId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return createApiError("Knowledge entry not found", 404);
    }

    // Archive instead of deleting: the AI only reads published entries and the
    // history stays auditable.
    await docRef.set(
      { status: "archived", updatedAt: new Date(), updatedBy: session.uid },
      { merge: true }
    );

    const { invalidateAiContext } = await import("@/lib/ai/context-builder");
    invalidateAiContext(ctx.tenantId);

    return createApiResponse({ documentId, archived: true });
  } catch (error: unknown) {
    return handleApiError("api/knowledge", error);
  }
}

