import { requireTenantScope as requireMember, tenantCollection } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
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

    const snap = await tenantCollection(ctx.tenantId, "knowledgeBase")
      .where("status", "==", "published")
      .get();

    const items = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        documentId: data.documentId,
        title: data.title,
        category: data.category,
        language: data.language,
        status: data.status,
        version: data.version,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });

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

    return createApiResponse({ documentId: docRef.id }, 201);
  } catch (error: unknown) {
    return handleApiError("api/knowledge", error);
  }
}
