import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireTenantScope, tenantRef } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError } from "@/lib/api/response";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const userId = searchParams.get("userId");
    const role = searchParams.get("role") || "readOnly";

    if (!tenantId || !userId) {
      return createApiError("Missing tenant or user", 400);
    }

    const ctx = await requireTenantScope(tenantId, userId, role);

    const snap = await tenantRef(ctx.tenantId, "knowledgeBase")
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
    const message = error instanceof Error ? error.message : "Internal error";
    return createApiError(message, 500);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const {
      tenantId,
      userId,
      role,
      title,
      category,
      content,
      language,
    } = await request.json();

    if (!tenantId || !userId || !title || !category) {
      return createApiError("Missing required fields", 400);
    }

    const ctx = await requireTenantScope(
      tenantId,
      userId,
      role || "readOnly"
    );

    const docRef = tenantRef(ctx.tenantId, "knowledgeBase").doc();
    await docRef.set({
      documentId: docRef.id,
      tenantId: ctx.tenantId,
      title,
      contentReference: content || "",
      category:
        category || "businessInfo",
      language: language || "en",
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
    const message = error instanceof Error ? error.message : "Internal error";
    return createApiError(message, 500);
  }
}
