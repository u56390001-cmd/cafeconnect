import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { resolveWidget, checkRateLimit } from "@/lib/widget/service";
import { respondToCustomer } from "@/lib/ai/orchestrator";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    if (!checkRateLimit(`msg:${ip}`)) {
      return createApiError("Too many requests, please slow down", 429);
    }

    const { publicWidgetId, message, conversationId, customerReference } =
      await request.json();

    if (!publicWidgetId || !message) {
      return createApiError("Missing widgetId or message", 400);
    }
    if (typeof message !== "string" || message.length > 2000) {
      return createApiError("Invalid message", 400);
    }
    if (conversationId && typeof conversationId !== "string") {
      return createApiError("Invalid conversationId", 400);
    }

    const config = await resolveWidget(publicWidgetId);
    if (!config) {
      return createApiError("Widget not found or disabled", 404);
    }

    const result = await respondToCustomer({
      tenantId: config.tenantId,
      channel: "web",
      message,
      conversationId: conversationId || undefined,
      customerReference: customerReference || `web:${ip}`,
    });

    return createApiResponse({
      reply: result.reply,
      conversationId: result.conversationId,
    });
  } catch (error: unknown) {
    return handleApiError("api/widget/message", error);
  }
}

