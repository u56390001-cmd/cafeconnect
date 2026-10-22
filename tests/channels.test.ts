import { describe, expect, it } from "vitest";
import {
  capabilitiesFor,
  formatProductListText,
  supports,
} from "@/lib/channels/capabilities";
import { isWidgetEventName, WIDGET_EVENTS } from "@/lib/analytics/events";

describe("channel capabilities", () => {
  it("gives the web widget the full presentation set", () => {
    expect(supports("web", "listMessages")).toBe(true);
    expect(supports("web", "catalogProducts")).toBe(true);
  });

  it("keeps WhatsApp on text until an account is verified", () => {
    expect(supports("whatsapp_meta", "text")).toBe(true);
    expect(supports("whatsapp_meta", "listMessages")).toBe(false);
    expect(supports("whatsapp_qr", "replyButtons")).toBe(false);
    expect(capabilitiesFor("whatsapp_qr")).toEqual(["text"]);
  });

  it("formats a numbered product list fallback", () => {
    const text = formatProductListText([
      { name: "Zinger Burger", priceLabel: "PKR 600" },
      { name: "Cheese Shawarma", priceLabel: "PKR 300" },
    ]);
    expect(text).toContain("1. Zinger Burger — PKR 600");
    expect(text).toContain("2. Cheese Shawarma — PKR 300");
    expect(text).toMatch(/reply with the number/i);
  });

  it("returns an empty string for an empty list", () => {
    expect(formatProductListText([])).toBe("");
  });
});

describe("widget analytics", () => {
  it("accepts only known event names", () => {
    expect(isWidgetEventName("widget_opened")).toBe(true);
    expect(isWidgetEventName("order_created")).toBe(true);
    expect(isWidgetEventName("message_content")).toBe(false);
    expect(isWidgetEventName("")).toBe(false);
  });

  it("covers the funnel events from the plan", () => {
    for (const name of [
      "widget_opened",
      "starter_prompt_clicked",
      "product_results_shown",
      "product_added",
      "cart_opened",
      "checkout_started",
      "order_created",
      "handoff_requested",
      "widget_error",
      "whatsapp_interactive_fallback_used",
    ]) {
      expect(WIDGET_EVENTS).toContain(name);
    }
  });
});
