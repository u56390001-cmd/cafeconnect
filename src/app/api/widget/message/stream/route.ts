import { NextRequest } from "next/server";
import { resolveWidget, checkRateLimit } from "@/lib/widget/service";
import { checkSharedRateLimit } from "@/lib/security/rate-limit";
import { respondToCustomer } from "@/lib/ai/orchestrator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
          conversationId: body.conversationId,
          customerReference: body.customerReference,
          identity: body.visitorId || body.customerReference || undefined,
          onDelta: (chunk) => send({ type: "delta", text: chunk }),
        });

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
