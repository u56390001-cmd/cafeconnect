import { describe, expect, it } from "vitest";
import {
  computePricing,
  evaluateDeliveryArea,
  hashPhone,
  type QuoteLine,
} from "@/lib/services/orders";

const line = (
  itemId: string,
  categoryId: string,
  unitPriceMinor: number,
  quantity: number
): QuoteLine => ({ itemId, categoryId, unitPriceMinor, quantity });

describe("order pricing", () => {
  it("sums line totals", () => {
    const result = computePricing(
      [line("a", "cat1", 35000, 2), line("b", "cat2", 55000, 1)],
      [],
      10000,
      "delivery"
    );
    expect(result.subtotalMinor).toBe(125000);
    expect(result.totalMinor).toBe(135000);
  });

  it("applies a whole-order percentage offer", () => {
    const result = computePricing(
      [line("a", "cat1", 50000, 2)],
      [{ type: "percentage", valuePct: 10, status: "active" }],
      0,
      "pickup"
    );
    expect(result.discountMinor).toBe(10000);
    expect(result.totalMinor).toBe(90000);
  });

  it("applies a scoped offer only to the matching category", () => {
    const result = computePricing(
      [line("a", "biryani", 35000, 2), line("b", "pizza", 55000, 1)],
      [
        {
          type: "percentage",
          valuePct: 15,
          status: "active",
          scopeCategoryIds: ["biryani"],
          minOrderMinor: 60000,
        },
      ],
      10000,
      "delivery"
    );
    // 15% of the biryani subtotal only (70000), not of the whole cart.
    expect(result.discountMinor).toBe(10500);
    expect(result.totalMinor).toBe(124500);
  });

  it("ignores a scoped offer whose scoped subtotal is below the minimum", () => {
    const result = computePricing(
      [line("a", "biryani", 35000, 1), line("b", "pizza", 55000, 1)],
      [
        {
          type: "percentage",
          valuePct: 15,
          status: "active",
          scopeCategoryIds: ["biryani"],
          minOrderMinor: 60000,
        },
      ],
      10000,
      "delivery"
    );
    expect(result.discountMinor).toBe(0);
    expect(result.totalMinor).toBe(100000);
  });

  it("waives the delivery fee for a free-delivery offer", () => {
    const result = computePricing(
      [line("a", "cat1", 40000, 1)],
      [{ type: "freeDelivery", status: "active", minOrderMinor: 30000 }],
      10000,
      "delivery"
    );
    expect(result.deliveryFeeMinor).toBe(0);
    expect(result.totalMinor).toBe(40000);
  });

  it("does not waive the delivery fee for pickup orders", () => {
    const result = computePricing(
      [line("a", "cat1", 40000, 1)],
      [{ type: "freeDelivery", status: "active" }],
      10000,
      "pickup"
    );
    expect(result.deliveryFeeMinor).toBe(10000);
  });

  it("ignores expired offers", () => {
    const result = computePricing(
      [line("a", "cat1", 50000, 1)],
      [
        {
          type: "percentage",
          valuePct: 50,
          status: "active",
          endAt: new Date(Date.now() - 60_000),
        },
      ],
      0,
      "pickup"
    );
    expect(result.discountMinor).toBe(0);
  });

  it("never produces a negative total", () => {
    const result = computePricing(
      [line("a", "cat1", 1000, 1)],
      [{ type: "fixedDiscount", valueMinor: 50000, status: "active" }],
      0,
      "pickup"
    );
    expect(result.totalMinor).toBe(0);
  });
});

describe("delivery area rule", () => {
  it("verifies an address inside a configured area", () => {
    const result = evaluateDeliveryArea("House 44, Faisal Town, Sargodha", ["faisal town"], "Sargodha");
    expect(result.status).toBe("verified");
  });

  it("rejects an address outside the configured area", () => {
    const result = evaluateDeliveryArea("Phase 2, Karachi", ["faisal town"], "Sargodha");
    expect(result.status).toBe("out_of_area");
  });

  it("reports unverified when the tenant has no rule", () => {
    const result = evaluateDeliveryArea("Anywhere", [], "Sargodha city");
    expect(result.status).toBe("unverified");
  });

  it("is not applicable without an address", () => {
    const result = evaluateDeliveryArea(undefined, ["faisal town"], null);
    expect(result.status).toBe("not_applicable");
  });
});

describe("phone hashing", () => {
  it("produces the same hash for the same number regardless of formatting", () => {
    expect(hashPhone("+92 300-1234567")).toBe(hashPhone("923001234567"));
  });

  it("produces different hashes for different numbers", () => {
    expect(hashPhone("923001234567")).not.toBe(hashPhone("923009999999"));
  });
});
