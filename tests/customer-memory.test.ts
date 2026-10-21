import { describe, expect, it } from "vitest";
import {
  customerIdFor,
  identityKey,
} from "@/lib/customers/identity";
import {
  ALLOWED_MEMORY_KEYS,
  renderMemoryBlock,
  type CustomerMemory,
  type CustomerProfile,
} from "@/lib/customers/memory";

function profile(overrides: Partial<CustomerProfile> = {}): CustomerProfile {
  return {
    customerId: "cust_1",
    tenantId: "tenant_a",
    displayName: null,
    preferredName: null,
    preferredLanguage: null,
    preferredScript: null,
    preferredFulfilment: null,
    consentStatus: "unknown",
    memoryEnabled: true,
    lastSeenAt: null,
    lastOrderAt: null,
    orderCount: 0,
    profileVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function memory(overrides: Partial<CustomerMemory> = {}): CustomerMemory {
  return {
    memoryId: "m1",
    customerId: "cust_1",
    tenantId: "tenant_a",
    type: "preference",
    key: "preferred_name",
    value: "Umar",
    sourceType: "explicit",
    confidence: 0.9,
    evidenceMessageId: null,
    evidenceOrderId: null,
    firstObservedAt: new Date(),
    lastConfirmedAt: new Date(),
    updatedAt: new Date(),
    expiresAt: null,
    consentBasis: "explicit_request",
    status: "active",
    ...overrides,
  };
}

describe("customer identity", () => {
  it("is stable for the same channel identifier", () => {
    expect(identityKey("web", "visitor-1")).toBe(identityKey("web", "visitor-1"));
    expect(customerIdFor("t1", "web", "visitor-1")).toBe(
      customerIdFor("t1", "web", "visitor-1")
    );
  });

  it("never stores the raw identifier in the document key", () => {
    const key = identityKey("whatsapp_qr", "+92 300 1234567");
    expect(key).not.toContain("300");
    expect(key).not.toContain("+");
    expect(key).toMatch(/^whatsapp_qr_[a-f0-9]{32}$/);
  });

  it("separates the same person across channels (no silent linking)", () => {
    expect(identityKey("web", "same")).not.toBe(identityKey("whatsapp_qr", "same"));
  });

  it("isolates customers between tenants", () => {
    const a = customerIdFor("tenant_a", "web", "visitor-1");
    const b = customerIdFor("tenant_b", "web", "visitor-1");
    expect(a).not.toBe(b);
  });

  it("normalises phone formatting before hashing", () => {
    expect(identityKey("whatsapp_qr", "+92 300 1234567")).toBe(
      identityKey("whatsapp_qr", "923001234567")
    );
  });
});

describe("memory rendering", () => {
  it("returns nothing when memory is disabled", () => {
    const block = renderMemoryBlock(profile({ memoryEnabled: false }), [
      memory(),
    ]);
    expect(block).toMatch(/disabled/i);
    expect(block).not.toContain("Umar");
  });

  it("returns nothing when consent was declined", () => {
    const block = renderMemoryBlock(
      profile({ consentStatus: "declined" }),
      [memory()]
    );
    expect(block).not.toContain("Umar");
  });

  it("includes the saved name and preferences", () => {
    const block = renderMemoryBlock(
      profile({
        preferredName: "Umar",
        preferredLanguage: "ur-Latn-PK",
        orderCount: 3,
      }),
      [memory({ key: "preferred_fulfilment", value: "delivery" })]
    );
    expect(block).toContain("Umar");
    expect(block).toContain("ur-Latn-PK");
    expect(block).toContain("delivery");
    expect(block).toContain("3");
  });

  it("tells the model not to mention the memory", () => {
    const block = renderMemoryBlock(profile({ preferredName: "Umar" }), [memory()]);
    expect(block).toMatch(/never mention/i);
  });
});

describe("memory keys", () => {
  it("only allows a fixed set of keys", () => {
    expect(ALLOWED_MEMORY_KEYS).toContain("preferred_name");
    expect(ALLOWED_MEMORY_KEYS).not.toContain("allergy");
    expect(ALLOWED_MEMORY_KEYS).not.toContain("religion");
  });
});
