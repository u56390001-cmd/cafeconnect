import { describe, expect, it } from "vitest";
import { formatMoney, majorToMinor, minorToMajor } from "@/lib/domain/money";
import { normalizePhone, phoneForStorage } from "@/lib/domain/phone";
import {
  allowedTransitions,
  canTransition,
  checkTransition,
  isOrderStatus,
  isPaymentStatus,
} from "@/lib/domain/order-status";

describe("money formatting (Pakistan-first)", () => {
  it("shows whole rupees without decimals", () => {
    expect(formatMoney(125000, "PKR")).toBe("Rs 1,250");
    expect(formatMoney(35000, "PKR")).toBe("Rs 350");
  });

  it("keeps real fractions instead of rounding them away", () => {
    expect(formatMoney(35050, "PKR")).toBe("Rs 350.50");
  });

  it("uses a currency label per tenant currency", () => {
    expect(formatMoney(1000, "USD")).toBe("$ 10");
    expect(formatMoney(1000, "AED")).toBe("AED 10");
  });

  it("converts between major and minor units", () => {
    expect(minorToMajor(125000)).toBe(1250);
    expect(majorToMinor(1250)).toBe(125000);
  });
});

describe("Pakistani phone normalisation", () => {
  it("accepts the local 03xx format and stores it in E.164 digits", () => {
    const result = normalizePhone("0300 1234567");
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe("923001234567");
  });

  it("accepts the international format", () => {
    const result = normalizePhone("+92 300 1234567");
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe("923001234567");
  });

  it("treats the same number written differently as one identity", () => {
    expect(normalizePhone("03001234567").normalized).toBe(
      normalizePhone("+92 300 1234567").normalized
    );
  });

  it("rejects an invalid local number with a helpful message", () => {
    const result = normalizePhone("12345");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/valid phone number/i);
  });

  it("keeps a Pakistani landline usable for a restaurant contact", () => {
    const result = normalizePhone("021 1234567");
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe("92211234567");
  });

  it("rejects an unknown local number", () => {
    const result = normalizePhone("0999 1234567");
    expect(result.ok).toBe(false);
  });

  it("keeps international numbers unchanged", () => {
    const result = normalizePhone("+971 50 123 4567");
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe("971501234567");
  });

  it("falls back to digits for storage when invalid", () => {
    expect(phoneForStorage("0300-123")).toBe("0300123");
  });
});

describe("order status state machine", () => {
  it("allows the normal delivery path", () => {
    expect(canTransition("received", "confirmed", "delivery")).toBe(true);
    expect(canTransition("confirmed", "preparing", "delivery")).toBe(true);
    expect(canTransition("preparing", "ready", "delivery")).toBe(true);
    expect(canTransition("ready", "dispatched", "delivery")).toBe(true);
    expect(canTransition("dispatched", "completed", "delivery")).toBe(true);
  });

  it("does not allow skipping steps", () => {
    expect(canTransition("received", "completed", "delivery")).toBe(false);
    expect(canTransition("received", "dispatched", "delivery")).toBe(false);
  });

  it("treats terminal states as final", () => {
    expect(allowedTransitions("completed", "delivery")).toEqual([]);
    expect(allowedTransitions("declined", "delivery")).toEqual([]);
    expect(allowedTransitions("cancelled", "delivery")).toEqual([]);
  });

  it("keeps pickup orders from being dispatched", () => {
    expect(canTransition("ready", "dispatched", "pickup")).toBe(false);
    expect(canTransition("ready", "completed", "pickup")).toBe(true);
  });

  it("returns a clear conflict message for an illegal move", () => {
    const result = checkTransition("received", "completed", "delivery");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cannot move/i);
  });

  it("rejects unknown status and payment values", () => {
    expect(isOrderStatus("shipped")).toBe(false);
    expect(isOrderStatus("received")).toBe(true);
    expect(isPaymentStatus("refunded")).toBe(true);
    expect(isPaymentStatus("cod")).toBe(false);
  });
});
