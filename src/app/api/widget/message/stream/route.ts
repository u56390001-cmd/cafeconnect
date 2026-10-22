import { NextRequest } from "next/server";
import { resolveWidget, checkRateLimit } from "@/lib/widget/service";
import { checkSharedRateLimit } from "@/lib/security/rate-limit";
import { respondToCustomer } from "@/lib/ai/orchestrator";
import { createTrackingToken } from "@/lib/tracking/token";
import type { WidgetBlock } from "@/lib/widget/ui-contract";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Adds a signed customer tracking link to a confirmed order card. */
async function withTrackingLinks(
  tenantId: string,
  publicWidgetId: string,
  blocks: WidgetBlock[]
): Promise<WidgetBlock[]> {
  return Promise.all(
    blocks.map(async (block) => {
      if (block.type !== "order_confirmation" || !block.order.orderId) {
        return block;
      }
      const token = createTrackingToken(tenantId, block.order.orderId);
      return {
        ...block,
        order: {
          ...block.order,
          trackUrl: `/track?key=${encodeURIComponent(
            publicWidgetId
          )}&token=${encodeURIComponent(token)}`,
        },
      };
    })
  );
}

interface StreamBody {
  publicWidgetId?: string;
  message?: string;
  conversationId?: string;
  customerReference?: string;
  /** Stable first-party visitor id (never the IP). */
  visitorId?: string;
}

/**
 * Server-sent events endpoint for the website chat widget. Text is streamed to
 * the browser as the model produces it, so the reply starts appearing in under
 * a second instead of after the full answer is ready.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  const memoryAllowed = checkRateLimit(`msg-stream:${ip}`);
  const limit = await checkSharedRateLimit("widget-stream", 30, memoryAllowed);
  if (!limit.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: StreamBody;
  try {
    body = (await request.json()) as StreamBody;
  } catch {
    return new Response(JSON.stringify({ error: "Bad request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const publicWidgetId = String(body.publicWidgetId ?? "").trim();
  const message = String(body.message ?? "").trim();
  // A widget conversation id is a high-entropy, first-party identifier that
  // scopes the customer's own cart. Anything else is ignored and a new
  // conversation is created server side.
  const rawConversationId = String(body.conversationId ?? "").trim();
  const conversationId = /^w_[A-Za-z0-9_-]{16,64}$/.test(rawConversationId)
    ? rawConversationId
    : undefined;

  if (!publicWidgetId || !message) {
    return new Response(JSON.stringify({ error: "Missing widget id or message" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (message.length > 2000) {
    return new Response(JSON.stringify({ error: "Message too long" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const config = await resolveWidget(publicWidgetId);
  if (!config) {
    return new Response(JSON.stringify({ error: "Widget not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      };

      try {
        const result = await respondToCustomer({
          tenantId: config.tenantId,
          channel: "web",
          message,
          conversationId,
          customerReference: body.customerReference,
          identity: body.visitorId || body.customerReference || undefined,
          onDelta: (chunk) => send({ type: "delta", text: chunk }),
        });

        // Rich blocks are built from verified server data, never from the
        // model's wording. The tracking link is signed here, where the
        // public widget id is known.
        const blocks = await withTrackingLinks(
          config.tenantId,
          publicWidgetId,
          result.ui ?? []
        );
        if (blocks.length > 0) {
          send({ type: "blocks", blocks });
        }

        send({
          type: "done",
          conversationId: result.conversationId,
          languageMode: result.languageMode,
          requestId: result.requestId,
        });
      } catch (error: unknown) {
        send({
          type: "error",
          message:
            error instanceof Error
              ? error.message.slice(0, 200)
              : "The assistant could not respond.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
