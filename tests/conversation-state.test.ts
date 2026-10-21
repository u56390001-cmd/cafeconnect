import { describe, expect, it } from "vitest";
import {
  buildStateBlock,
  deriveActiveIntent,
  deriveCompactSummary,
  deriveMissingOrderDetails,
} from "@/lib/ai/conversation-state";
import { buildGroundedPrompt, PROMPT_VERSION } from "@/lib/ai/prompt-builder";
import { detectLanguage } from "@/lib/ai/language";
import type { TenantAiContext } from "@/lib/ai/context-builder";

function context(): TenantAiContext {
  return {
    businessName: "Sargodha Biryani",
    businessTypes: ["restaurant"],
    currency: "PKR",
    business: {
      name: "Sargodha Biryani",
      types: ["restaurant"],
      phone: null,
      address: null,
      hours: "Daily 12pm - 12am",
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
          name: "Chicken Biryani Full",
          description: "With leg piece",
          priceLabel: "PKR 350",
          availability: "available",
          aliases: ["chicken biryani", "biryani"],
        },
      ],
    },
    offers: [],
    knowledge: [
      {
        title: "Opening Hours",
        category: "businessInfo",
        content: "Open daily 12pm to 12am.",
      },
    ],
  };
}

describe("conversation state", () => {
  it("detects an order request", () => {
    expect(deriveActiveIntent("Mujhe 2 biryani order karne hain")).toBe(
      "order_request"
    );
  });

  it("detects a human request", () => {
    expect(deriveActiveIntent("I want to talk to a human please")).toBe(
      "human_request"
    );
  });

  it("detects an order status question", () => {
    expect(deriveActiveIntent("what is the status of my order?")).toBe(
      "order_status"
    );
  });

  it("detects a menu question", () => {
    expect(deriveActiveIntent("what is on the menu and the price?")).toBe(
      "menu_question"
    );
  });

  it("lists the order details still missing", () => {
    const missing = deriveMissingOrderDetails("2 biryani please", []);
    expect(missing).toContain("name");
    expect(missing).toContain("phone");
    expect(missing).toContain("address");
  });

  it("does not ask again for details already in the history", () => {
    const missing = deriveMissingOrderDetails(
      "aur ek pizza",
      ["naam Umar hai", "phone 03001234567", "address house 44 Sargodha"]
    );
    expect(missing).not.toContain("name");
    expect(missing).not.toContain("phone");
    expect(missing).not.toContain("address");
  });

  it("builds a compact summary from the history", () => {
    const summary = deriveCompactSummary([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
    ]);
    expect(summary).toContain("Customer: Hi");
    expect(summary).toContain("Assistant: Hello!");
  });

  it("renders the state block for the prompt", () => {
    const block = buildStateBlock({
      activeIntent: "order_request",
      missingOrderDetails: ["address"],
      mentionedItems: [],
      cartRevision: 2,
      lastVerifiedQuote: "PKR 450",
      lastOrderNumber: "TC-1",
      handoffStatus: "open",
      compactSummary: "Customer: 2 biryani",
      stateVersion: 3,
    });
    expect(block).toContain("order request");
    expect(block).toContain("address");
    expect(block).toContain("PKR 450");
  });
});

describe("prompt language layers", () => {
  it("uses the same prompt for every channel (no channel-specific brain)", () => {
    const prompt = buildGroundedPrompt(context(), [], {
      languageMode: "ur-Latn-PK",
    });
    expect(prompt).not.toMatch(/whatsapp only|widget only/i);
    expect(prompt).toContain(PROMPT_VERSION);
  });

  it("mirrors Roman Urdu", () => {
    const prompt = buildGroundedPrompt(context(), [], {
      languageMode: "ur-Latn-PK",
    });
    expect(prompt).toMatch(/Roman Urdu/);
  });

  it("mirrors Urdu script", () => {
    const prompt = buildGroundedPrompt(context(), [], { languageMode: "ur-PK" });
    expect(prompt).toMatch(/Urdu \(Urdu script\)/);
  });

  it("mirrors mixed Urdu-English", () => {
    const prompt = buildGroundedPrompt(context(), [], {
      languageMode: "mixed-PK",
    });
    expect(prompt).toMatch(/mixed Urdu-English/);
  });

  it("exposes local aliases so the agent can match customer wording", () => {
    const prompt = buildGroundedPrompt(context(), []);
    expect(prompt).toContain("also called: chicken biryani, biryani");
  });

  it("includes the conversation state block", () => {
    const prompt = buildGroundedPrompt(context(), [], {
      stateSummary: "Active intent: order request",
    });
    expect(prompt).toContain("Active intent: order request");
  });
});

describe("language detection feeding the prompt", () => {
  it("routes an Hinglish message to the mixed mode", () => {
    const detected = detectLanguage(
      "bhai 2 zinger burger aur ek coke please add karo"
    );
    expect(["mixed-PK", "ur-Latn-PK"]).toContain(detected.mode);
  });

  it("routes an Urdu-script message to Urdu", () => {
    const detected = detectLanguage("میں دو بریانی چاہیے، کینے کا پتہ بتائیں");
    expect(detected.mode).toBe("ur-PK");
  });
});
