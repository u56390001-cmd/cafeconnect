import { NextRequest } from "next/server";
import { resolveWidget, checkRateLimit } from "@/lib/widget/service";
import { checkSharedRateLimit } from "@/lib/security/rate-limit";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { isWidgetEventName, recordWidgetEvent } from "@/lib/analytics/events";

export const dynamic = "force-dynamic";

/**
 * Public widget analytics endpoint.
 *
 * Records structural events only. The public widget id identifies the
 * tenant; no customer content is accepted or stored.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const memoryAllowed = checkRateLimit(`widget-events:${ip}`);
    const limit = await checkSharedRateLimit("widget-events", 120, memoryAllowed);
    if (!limit.allowed) return createApiError("Too many requests", 429);

    const body = (await request.json()) as {
      key?: string;
      event?: string;
      dimensions?: Record<string, string | number | boolean | null | undefined>;
    };

    const key = String(body.key ?? "");
    if (!key) return createApiError("Missing key", 400);
    if (!isWidgetEventName(body.event)) {
      return createApiError("Unknown event", 400);
    }

    const config = await resolveWidget(key);
    if (!config) return createApiError("Widget not found", 404);

    await recordWidgetEvent({
      tenantId: config.tenantId,
      event: body.event,
      dimensions: body.dimensions,
    });

    return createApiResponse({ recorded: true });
  } catch (error: unknown) {
    return handleApiError("api/widget/events", error);
  }
}
