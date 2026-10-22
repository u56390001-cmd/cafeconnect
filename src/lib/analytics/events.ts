import { tenantCollection } from "@/lib/tenancy/resolver";
import { randomUUID } from "crypto";

/**
 * Tenant-scoped widget analytics.
 *
 * Only structural events are recorded - never message content, never phone
 * numbers, never addresses. The event name and a small set of allow-listed
 * dimensions are enough to measure the funnel without collecting customer
 * data.
 */

export const WIDGET_EVENTS = [
  "widget_opened",
  "starter_prompt_clicked",
  "menu_search_submitted",
  "product_results_shown",
  "product_card_opened",
  "product_added",
  "modifier_selection_completed",
  "cart_opened",
  "cart_item_updated",
  "checkout_started",
  "checkout_validation_failed",
  "order_created",
  "handoff_requested",
  "widget_error",
  "whatsapp_interactive_fallback_used",
] as const;

export type WidgetEventName = (typeof WIDGET_EVENTS)[number];

/** Dimensions that may be stored with an event. */
const ALLOWED_DIMENSIONS = [
  "channel",
  "itemCount",
  "productCount",
  "hasOptions",
  "fulfilmentType",
  "outcome",
  "reason",
  "code",
  "languageMode",
  "device",
] as const;

export interface WidgetEventInput {
  tenantId: string;
  event: WidgetEventName;
  dimensions?: Record<string, string | number | boolean | null | undefined>;
  /** Milliseconds since epoch; defaults to now. */
  at?: number;
}

function sanitizeDimensions(
  dimensions: WidgetEventInput["dimensions"]
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  if (!dimensions) return result;
  for (const key of ALLOWED_DIMENSIONS) {
    const value = dimensions[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      result[key] = value.slice(0, 60);
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    }
  }
  return result;
}

/** Records a widget event. Failures never break the customer flow. */
export async function recordWidgetEvent(
  input: WidgetEventInput
): Promise<void> {
  try {
    await tenantCollection(input.tenantId, "widgetEvents").doc(randomUUID()).set({
      event: input.event,
      dimensions: sanitizeDimensions(input.dimensions),
      at: input.at ?? Date.now(),
      createdAt: new Date(),
    });
  } catch (error: unknown) {
    console.error(
      `[analytics-error] scope=recordWidgetEvent event=${input.event} message=${
        error instanceof Error ? error.message.slice(0, 120) : "unknown"
      }`
    );
  }
}

export function isWidgetEventName(value: unknown): value is WidgetEventName {
  return (
    typeof value === "string" &&
    (WIDGET_EVENTS as readonly string[]).includes(value)
  );
}
