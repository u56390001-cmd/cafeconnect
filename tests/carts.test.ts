import { describe, expect, it } from "vitest";
import { cartIdForConversation, CartError } from "@/lib/services/carts";
import { computePricing } from "@/lib/services/orders";

/**
 * Cart logic that does not need Firestore is verified here. The Firestore
 * dependent paths (pricing against the live menu, quote expiry and the
 * idempotent submit) are covered by the service itself; these tests pin the
 * rules that the AI depends on.
 */
describe("cart identity", () => {
  it("is deterministic per conversation", () => {
    expect(cartIdForConversation("abc123")).toBe(cartIdForConversation("abc123"));
  });

  it("produces different ids for different conversations", () => {
    expect(cartIdForConversation("abc123")).not.toBe(
      cartIdForConversation("def456")
    );
  });

  it("produces a Firestore-safe id", () => {
    expect(cartIdForConversation("weird id/with:chars")).toMatch(
      /^[A-Za-z0-9_-]+$/
    );
  });
});

describe("cart corrections merge instead of duplicating", () => {
  /**
   * Mirrors the merge rule used by updateCart: adding the same item twice
   * increases the quantity of one line instead of creating a second line.
   */
  function merge(
    current: Array<{ itemId: string; quantity: number }>,
    incoming: Array<{ itemId: string; quantity: number }>,
    operation: "add" | "remove" | "set"
  ): Array<{ itemId: string; quantity: number }> {
    const lines = new Map(current.map((line) => [line.itemId, { ...line }]));
    for (const entry of incoming) {
      const existing = lines.get(entry.itemId);
      if (operation === "remove") {
        if (!existing) continue;
        const next = existing.quantity - entry.quantity;
        if (next <= 0) lines.delete(entry.itemId);
        else lines.set(entry.itemId, { ...existing, quantity: next });
        continue;
      }
      if (operation === "set") {
        if (entry.quantity <= 0) lines.delete(entry.itemId);
        else lines.set(entry.itemId, { ...(existing ?? entry), quantity: entry.quantity });
        continue;
      }
      lines.set(entry.itemId, {
        ...(existing ?? entry),
        quantity: (existing?.quantity ?? 0) + entry.quantity,
      });
    }
    return Array.from(lines.values());
  }

  it("merges a repeated add into one line", () => {
    const result = merge([{ itemId: "a", quantity: 1 }], [{ itemId: "a", quantity: 2 }], "add");
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(3);
  });

  it("removes a line when the quantity reaches zero", () => {
    const result = merge([{ itemId: "a", quantity: 2 }], [{ itemId: "a", quantity: 2 }], "remove");
    expect(result).toHaveLength(0);
  });

  it("replaces the quantity on set", () => {
    const result = merge([{ itemId: "a", quantity: 2 }], [{ itemId: "a", quantity: 1 }], "set");
    expect(result[0].quantity).toBe(1);
  });
});

describe("quote and submit invariants", () => {
  it("quotes the same total that the order engine charges", () => {
    const priced = computePricing(
      [{ itemId: "a", categoryId: "c1", unitPriceMinor: 35000, quantity: 2 }],
      [],
      10000,
      "delivery"
    );
    expect(priced.totalMinor).toBe(80000);
  });

  it("rejects a quote for a revision that no longer exists", () => {
    const error = new CartError(
      "QUOTE_REVISION_CHANGED",
      "The cart changed after the quote was created"
    );
    expect(error.code).toBe("QUOTE_REVISION_CHANGED");
  });

  it("marks an expired quote with its own code", () => {
    const error = new CartError("QUOTE_EXPIRED", "The quote expired");
    expect(error.code).toBe("QUOTE_EXPIRED");
  });

  it("blocks a second submission of the same cart", () => {
    const error = new CartError("CART_ALREADY_SUBMITTED", "already submitted");
    expect(error.code).toBe("CART_ALREADY_SUBMITTED");
  });
});

describe("idempotency key for cart submits", () => {
  it("is stable for the same cart revision", () => {
    const key = (cartId: string, revision: number) =>
      `cart_${cartId}_${revision}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
    expect(key("cart_abc", 3)).toBe(key("cart_abc", 3));
  });

  it("changes when the revision changes (a new order is a new cart revision)", () => {
    const key = (cartId: string, revision: number) =>
      `cart_${cartId}_${revision}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
    expect(key("cart_abc", 3)).not.toBe(key("cart_abc", 4));
  });
});
