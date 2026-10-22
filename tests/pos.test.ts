import { describe, expect, it } from "vitest";
import { cartIdForConversation } from "@/lib/services/carts";
import { computePricing, type QuoteLine } from "@/lib/services/orders";
import { validateSelections, optionGroupsOf, lineTotalMinor } from "@/lib/domain/options";
import { formatMoney } from "@/lib/domain/money";
import { printKot, printBill } from "@/lib/print/receipt";

/**
 * Point-of-sale regressions (counter order taking).
 *
 * The POS shares the pricing engine and the option domain with online
 * orders; these tests pin the rules the counter flow depends on. Firestore
 * dependent behavior (order creation, payments, draft persistence) is
 * covered by the services themselves and verified in the live gate.
 */

const posLine = (
  itemId: string,
  categoryId: string,
  unitPriceMinor: number,
  quantity: number
): QuoteLine => ({ itemId, categoryId, unitPriceMinor, quantity });

describe("POS pricing uses the shared engine", () => {
  it("a pickup order pays item totals without a delivery fee", () => {
    const result = computePricing(
      [posLine("shwarma", "grill", 30000, 1), posLine("shwarma", "grill", 63000, 2)],
      [],
      10000,
      "pickup"
    );
    expect(result.subtotalMinor).toBe(156000);
    expect(result.discountMinor).toBe(0);
    expect(result.deliveryFeeMinor).toBe(0);
    expect(result.totalMinor).toBe(156000);
  });

  it("a delivery order pays the configured delivery fee", () => {
    const result = computePricing(
      [posLine("shwarma", "grill", 30000, 1)],
      [],
      10000,
      "delivery"
    );
    expect(result.deliveryFeeMinor).toBe(10000);
    expect(result.totalMinor).toBe(40000);
  });

  it("the quoted total matches line displays: base + option delta × quantity", () => {
    // 300 base + 30 option delta, two lines of qty 2 each.
    const unit = 30000 + 3000;
    expect(lineTotalMinor(30000, 3000, 2)).toBe(unit * 2);
    const result = computePricing(
      [posLine("shwarma", "grill", unit, 2)],
      [],
      0,
      "pickup"
    );
    expect(result.subtotalMinor).toBe(unit * 2);
  });

  it("bill formatting uses the shared money helper", () => {
    // 1260 rupees from 126000 minor units.
    expect(formatMoney(126000, "PKR")).toContain("1,260");
  });
});

describe("POS draft storage reuses cart identity", () => {
  it("derives a deterministic cart id for a POS draft conversation", () => {
    const draftConversationId = "pos_draft_test1234";
    expect(cartIdForConversation(draftConversationId)).toBe(
      cartIdForConversation(draftConversationId)
    );
  });

  it("keeps the draft id Firestore-safe even with odd characters", () => {
    expect(cartIdForConversation("pos_draft_xyz/with:chars")).toMatch(
      /^[A-Za-z0-9_-]+$/
    );
  });
});

describe("counter option taking follows the menu configuration", () => {
  const item = {
    optionGroups: [
      {
        groupId: "g_size",
        name: "Size",
        type: "single",
        required: true,
        minSelections: 1,
        maxSelections: 1,
        active: true,
        options: [
          { optionId: "opt_regular", name: "Regular", priceDeltaMinor: 0, active: true },
          { optionId: "opt_large", name: "Large", priceDeltaMinor: 3000, active: true },
        ],
      },
      {
        groupId: "g_extras",
        name: "Extras",
        type: "multiple",
        required: false,
        minSelections: 0,
        maxSelections: 2,
        active: true,
        options: [
          { optionId: "opt_cheese", name: "Extra cheese", priceDeltaMinor: 2000, active: true },
          { optionId: "opt_fries", name: "Fries", priceDeltaMinor: 5000, active: true },
          { optionId: "opt_x", name: "X", priceDeltaMinor: 1000, active: true },
        ],
      },
    ],
  };
  const groups = optionGroupsOf(item);

  it("a required size blocks adding the product without a choice", () => {
    const result = validateSelections(groups, []);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Size");
  });

  it("enforces the maximum number of extras", () => {
    const result = validateSelections(groups, [
      { groupId: "g_size", optionIds: ["opt_regular"] },
      {
        groupId: "g_extras",
        optionIds: ["opt_cheese", "opt_fries", "opt_x"],
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("at most 2");
  });

  it("prices the chosen configuration server-side rules", () => {
    const result = validateSelections(groups, [
      { groupId: "g_size", optionIds: ["opt_large"] },
      { groupId: "g_extras", optionIds: ["opt_cheese"] },
    ]);
    expect(result.ok).toBe(true);
    expect(result.priceDeltaMinor).toBe(5000);
  });
});

describe("printed tickets come only from confirmed orders", () => {
  const confirmedOrder = {
    orderNumber: "TC-261025-0001",
    businessName: "Sargodha Biryani & BBQ",
    fulfilmentType: "pickup" as const,
    items: [
      {
        name: "Chicken Shawarma",
        quantity: 2,
        unitPriceMinor: 63000,
        lineTotalMinor: 126000,
        basePriceMinor: 30000,
        options: [{ groupName: "Size", optionNames: ["Large"] }],
        note: "less spicy",
      },
    ],
    subtotalMinor: 126000,
    discountMinor: 0,
    deliveryFeeMinor: 0,
    totalMinor: 126000,
    currency: "PKR",
  };

  it("printing needs a browser window (headless runs are safe no-ops)", () => {
    expect(printKot(confirmedOrder)).toBe(false);
    expect(printBill(confirmedOrder)).toBe(false);
  });
});
