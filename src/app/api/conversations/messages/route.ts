import { requireTenantScope, tenantDoc, tenantCollection } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";
import { sendQrText } from "@/lib/whatsapp/qr-provider";
import { sendMetaText } from "@/lib/whatsapp/meta-cloud";
import { getTenantApiKey } from "@/lib/settings/keys";

export const dynamic = "force-dynamic";

interface StaffMessageBody {
  tenantId?: string;
  conversationId?: string;
  content?: string;
  /** Reopen a conversation that was handed off to a human. */
  reopen?: boolean;
}

/**
 * Stores a staff reply and delivers it to the customer on the same channel.
 * This is the human side of the handoff flow: once staff reply, the
 * assistant stays out of the conversation until staff reopen it.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = (await request.json()) as StaffMessageBody;
    const tenantId = body.tenantId;
    const conversationId = body.conversationId;
    const content = String(body.content ?? "").trim();

    if (!tenantId || !conversationId) {
      return createApiError("Missing tenantId or conversationId", 400);
    }
    if (!content && !body.reopen) {
      return createApiError("Message content is required", 400);
    }
    if (content.length > 4000) {
      return createApiError("Message too long", 400);
    }

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");

    const conversationRef = tenantDoc(ctx.tenantId, "conversations", conversationId);
    const conversationSnap = await conversationRef.get();
    if (!conversationSnap.exists) {
      return createApiError("Conversation not found", 404);
    }
    const conversation = conversationSnap.data() ?? {};
    const channel = String(conversation.channel ?? "web");
    const customerReference = String(conversation.customerReference ?? "");

    if (content) {
      const ref = tenantCollection(ctx.tenantId, "conversations")
        .doc(conversationId)
        .collection("messages")
        .doc();
      await ref.set({
        messageId: ref.id,
        tenantId: ctx.tenantId,
        conversationId,
        direction: "outbound",
        senderType: "staff",
        content,
        processingStatus: "processed",
        deliveryStatus: "sent",
        sourceReferences: [],
        createdBy: session.uid,
        createdAt: new Date(),
      });
    }

    // Staff owns the conversation until it is explicitly reopened.
    await conversationRef.set(
      {
        status: body.reopen ? "open" : conversation.status ?? "open",
        aiEnabled: body.reopen ? true : false,
        updatedAt: new Date(),
        lastMessageAt: new Date(),
      },
      { merge: true }
    );

    let delivered = false;
    let deliveryError: string | null = null;

    if (content) {
      try {
        if (channel === "whatsapp_qr") {
          const token =
            (await getTenantApiKey(ctx.tenantId, "qr_provider"))?.key ??
            process.env.QR_PROVIDER_API_KEY?.trim();
          if (token) {
            await sendQrText(token, customerReference, content);
            delivered = true;
          }
        } else if (channel === "whatsapp_meta") {
          const token =
            (await getTenantApiKey(ctx.tenantId, "meta_whatsapp"))?.key ??
            process.env.WHATSAPP_ACCESS_TOKEN?.trim();
          const phoneNumberId = conversation.phoneNumberId as string | undefined;
          if (token && phoneNumberId) {
            await sendMetaText({
              accessToken: token,
              phoneNumberId,
              to: customerReference,
              text: content,
            });
            delivered = true;
          }
        } else {
          // Web conversations are read by the widget on the next poll; there
          // is no push transport for the browser channel.
          delivered = true;
        }
      } catch (error: unknown) {
        deliveryError =
          error instanceof Error ? error.message.slice(0, 200) : "delivery failed";
      }
    }

    return createApiResponse({
      delivered,
      deliveryError,
      aiEnabled: body.reopen ? true : false,
    });
  } catch (error: unknown) {
    return handleApiError("api/conversations/messages", error);
  }
}
