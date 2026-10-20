import { tenantCollection, tenantDoc, requireTenantScope } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const CONVERSATION_STATUSES = ["open", "waitingForHuman", "resolved", "closed"] as const;

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const query = new URL(request.url).searchParams;
    const tenantId = query.get("tenantId");
    const conversationId = query.get("conversationId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    await requireTenantScope(tenantId, session.uid, "member");

    if (conversationId) {
      const messagesSnap = await tenantCollection(tenantId, "conversations")
        .doc(conversationId)
        .collection("messages")
        .orderBy("createdAt", "asc")
        .get();

      const messages = messagesSnap.docs.map((doc) => {
        const d = doc.data();
        return {
          messageId: d.messageId || doc.id,
          direction: d.direction,
          senderType: d.senderType,
          content: d.content,
          createdAt: d.createdAt,
        };
      });

      return createApiResponse({ conversationId, messages });
    }

    const snap = await tenantCollection(tenantId, "conversations").get();
    const conversations = snap.docs
      .sort(
        (a, b) =>
          new Date(b.data().lastMessageAt as Date).getTime() -
          new Date(a.data().lastMessageAt as Date).getTime()
      )
      .map((doc) => {
        const d = doc.data();
        return {
          conversationId: d.conversationId || doc.id,
          channel: d.channel,
          customerReference: d.customerReference,
          status: d.status,
          messageCount: d.messageCount ?? 0,
          lastMessageAt: d.lastMessageAt,
          createdAt: d.createdAt,
        };
      });

    return createApiResponse({ conversations });
  } catch (error: unknown) {
    return handleApiError("api/conversations", error);
  }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const { tenantId, conversationId, status } = await request.json();
    if (!tenantId || !conversationId) {
      return createApiError("Missing tenantId or conversationId", 400);
    }
    if (!CONVERSATION_STATUSES.includes(status)) {
      return createApiError("Invalid status", 400);
    }

    await requireTenantScope(tenantId, session.uid, "member");

    await tenantDoc(tenantId, "conversations", conversationId).set(
      { status, updatedAt: new Date() },
      { merge: true }
    );

    return createApiResponse({ conversationId, status });
  } catch (error: unknown) {
    return handleApiError("api/conversations", error);
  }
}
