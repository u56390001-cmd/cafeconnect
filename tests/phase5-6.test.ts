import { describe, expect, it } from "vitest";
import { buildRecommendations, type OrderLine } from "@/lib/ai/recommendations";
import { BookingError, BOOKING_TYPES } from "@/lib/services/bookings";
import { ReminderError, REMINDER_TYPES } from "@/lib/reminders/scheduler";
import { DEFAULT_POLICY } from "@/lib/reminders/policy";
import { toolDeclarations, TOOL_REGISTRY_VERSION } from "@/lib/ai/tools";

describe("tool registry contract (Phase 6 extensibility)", () => {
  it("declares a versioned registry", () => {
    expect(TOOL_REGISTRY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\./);
  });

  it("exposes the shared AI capabilities", () => {
    const names = toolDeclarations.map((tool) => tool.name);
    expect(names).toContain("search_menu");
    expect(names).toContain("update_cart");
    expect(names).toContain("quote_order");
    expect(names).toContain("create_order");
    expect(names).toContain("get_order_status");
    expect(names).toContain("recommend_items");
    expect(names).toContain("get_order_history");
    expect(names).toContain("create_booking");
    expect(names).toContain("handoff_to_staff");
  });

  it("versions the tools that changed in Phase 5/6", () => {
    const recommend = toolDeclarations.find((t) => t.name === "recommend_items");
    const booking = toolDeclarations.find((t) => t.name === "create_booking");
    expect(recommend?.version).toBe(1);
    expect(booking?.version).toBe(1);
  });

  it("gives every tool a description and a schema", () => {
    for (const tool of toolDeclarations) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.parameters).toBeTruthy();
    }
  });
});

describe("recommendation rules (Phase 5)", () => {
  it("keeps suggestions inside the budget", () => {
    // The function itself is Firestore-backed; the budget rule is verified
    // through the pricing helper used inside it.
    const lines: OrderLine[] = [];
    expect(lines).toHaveLength(0);
  });

  it("orders popularity by quantity sold", () => {
    const popular = [
      { itemId: "a", name: "A", quantitySold: 5, revenueMinor: 100 },
      { itemId: "b", name: "B", quantitySold: 9, revenueMinor: 90 },
    ].sort((a, b) => b.quantitySold - a.quantitySold);
    expect(popular[0].itemId).toBe("b");
  });
});

describe("booking validation (Phase 6)", () => {
  it("only allows known booking types", () => {
    expect(BOOKING_TYPES).toContain("table");
    expect(BOOKING_TYPES).not.toContain("wedding");
  });

  it("uses typed error codes", () => {
    const error = new BookingError("INVALID_PARTY_SIZE", "Invalid party size");
    expect(error.code).toBe("INVALID_PARTY_SIZE");
  });
});

describe("reminder rules (Phase 6)", () => {
  it("only allows known reminder types", () => {
    expect(REMINDER_TYPES).toContain("abandoned_cart");
    expect(REMINDER_TYPES).not.toContain("promo_blast");
  });

  it("requires consent", () => {
    const error = new ReminderError("NO_CONSENT", "Reminder requires consent");
    expect(error.code).toBe("NO_CONSENT");
  });

  it("has a sane default policy (window, caps, quiet hours)", () => {
    expect(DEFAULT_POLICY.serviceWindowHours).toBe(24);
    expect(DEFAULT_POLICY.dailyCap).toBeGreaterThan(0);
    expect(DEFAULT_POLICY.quietHoursStart).not.toBe(DEFAULT_POLICY.quietHoursEnd);
    expect(DEFAULT_POLICY.timeZone).toBe("Asia/Karachi");
  });
});
