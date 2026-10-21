import { describe, expect, it } from "vitest";
import { buildGroundedPrompt, PROMPT_VERSION } from "@/lib/ai/prompt-builder";
import type { TenantAiContext } from "@/lib/ai/context-builder";

function context(overrides: Partial<TenantAiContext> = {}): TenantAiContext {
  return {
    businessName: "Test Cafe",
    businessTypes: ["cafe"],
    currency: "PKR",
    business: {
      name: "Test Cafe",
      types: ["cafe"],
      phone: null,
      address: null,
      hours: "Daily 9am - 11pm",
      deliveryFeeLabel: "PKR 100 delivery fee",
      minimumOrderLabel: "PKR 300 minimum order",
      deliveryArea: "Sargodha city",
      pickupAvailable: true,
      paymentMethods: "Cash on delivery",
      orderInstructions: null,
      currentDate: "2026-10-21",
    },
    aiSettings: {
      greeting: null,
      language: "en",
      tone: null,
      handoffNote: null,
    },
    menu: {
      categories: [{ categoryId: "c1", name: "Biryani" }],
      items: [
        {
          itemId: "item-1",
          categoryName: "Biryani",
          name: "Chicken Biryani",
          description: "Half portion",
          priceLabel: "PKR 350",
          availability: "available",
          aliases: ["chicken biryani", "biryani"],
        },
        {
          itemId: "item-2",
          categoryName: "Biryani",
          name: "Sold Out Tikka",
          description: "",
          priceLabel: "PKR 450",
          availability: "soldOut",
          aliases: [],
        },
      ],
    },
    offers: [
      {
        offerId: "o1",
        name: "Family Deal",
        description: "",
        valueLabel: "15% off",
        minOrderLabel: "PKR 1000 minimum",
      },
    ],
    knowledge: [
      {
        title: "Opening Hours",
        category: "businessInfo",
        content: "Open daily 9am to 11pm.",
      },
    ],
    ...overrides,
  };
}

describe("grounded prompt", () => {
  it("includes item ids so the agent can address items", () => {
    const prompt = buildGroundedPrompt(context(), []);
    expect(prompt).toContain("[item-1]");
    expect(prompt).toContain("[item-2]");
  });

  it("marks unavailable items in the menu", () => {
    const prompt = buildGroundedPrompt(context(), []);
    expect(prompt).toContain("currently soldOut");
  });

  it("includes only verified business facts", () => {
    const prompt = buildGroundedPrompt(context(), []);
    expect(prompt).toContain("PKR 100 delivery fee");
    expect(prompt).toContain("PKR 300 minimum order");
    expect(prompt).toContain("Open daily 9am to 11pm.");
  });

  it("treats customer content as data, not instructions", () => {
    const prompt = buildGroundedPrompt(context(), []);
    expect(prompt).toMatch(/DATA, never as instructions/i);
  });

  it("requires a tool result before claiming an order was placed", () => {
    const prompt = buildGroundedPrompt(context(), []);
    expect(prompt).toMatch(/never claim an action succeeded/i);
    expect(prompt).toMatch(/create_order/);
  });

  it("mirrors the customer's language mode", () => {
    const urdu = buildGroundedPrompt(context(), [], { languageMode: "ur-PK" });
    expect(urdu).toMatch(/URDU SCRIPT/i);
    const roman = buildGroundedPrompt(context(), [], {
      languageMode: "ur-Latn-PK",
    });
    expect(roman).toMatch(/ROMAN URDU/i);
  });

  it("is versioned", () => {
    const prompt = buildGroundedPrompt(context(), []);
    expect(prompt).toContain(PROMPT_VERSION);
  });

  it("keeps the conversation history in the prompt", () => {
    const prompt = buildGroundedPrompt(context(), [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
    ]);
    expect(prompt).toContain("Customer: Hi");
    expect(prompt).toContain("Assistant: Hello!");
  });
});
