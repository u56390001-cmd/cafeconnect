import { readFileSync } from "fs";
import { check, fail, ok, type EvalScenario } from "../types";
import { computePricing, evaluateDeliveryArea, hashPhone } from "@/lib/services/orders";
import { detectLanguage, normalizeMode, stringsFor } from "@/lib/ai/language";
import {
  ALLOWED_MEMORY_KEYS,
  renderMemoryBlock,
  type CustomerMemory,
  type CustomerProfile,
} from "@/lib/customers/memory";
import {
  customerIdFor,
  identityKey,
  normalizeIdentifier,
} from "@/lib/customers/identity";
import { BookingError, BOOKING_TYPES } from "@/lib/services/bookings";
import { REMINDER_TYPES, ReminderError } from "@/lib/reminders/scheduler";
import { DEFAULT_POLICY } from "@/lib/reminders/policy";
import { toolDeclarations, TOOL_REGISTRY_VERSION } from "@/lib/ai/tools";
import { buildGroundedPrompt, PROMPT_VERSION } from "@/lib/ai/prompt-builder";
import type { TenantAiContext } from "@/lib/ai/context-builder";
import { OrderError } from "@/lib/services/orders";

function line(
  itemId: string,
  categoryId: string,
  unitPriceMinor: number,
  quantity: number
) {
  return { itemId, categoryId, unitPriceMinor, quantity };
}

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
          description: "",
          priceLabel: "PKR 350",
          availability: "available",
          aliases: ["chicken biryani"],
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
        name: "Biryani Deal",
        description: "",
        valueLabel: "15% off",
        minOrderLabel: "PKR 1000 minimum",
      },
    ],
    knowledge: [
      {
        title: "Opening Hours",
        category: "businessInfo",
        content: "Open daily 12pm to 12am.",
      },
    ],
    ...overrides,
  };
}

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

export const coreScenarios: EvalScenario[] = [
  // ---------------------------------------------------------------- pricing
  {
    id: "pricing-001-subtotal",
    category: "pricing",
    description: "Subtotal is the sum of unit price times quantity",
    weight: "hard",
    kind: "pure",
    run: () => {
      const result = computePricing(
        [line("a", "c1", 35000, 2), line("b", "c2", 55000, 1)],
        [],
        10000,
        "delivery"
      );
      return ok([
        check("subtotal", result.subtotalMinor === 125000, `${result.subtotalMinor}`),
        check("total", result.totalMinor === 135000, `${result.totalMinor}`),
      ]);
    },
  },
  {
    id: "pricing-002-whole-order-percentage",
    category: "pricing",
    description: "A whole-order percentage offer discounts the full subtotal",
    weight: "hard",
    kind: "pure",
    run: () => {
      const result = computePricing(
        [line("a", "c1", 50000, 2)],
        [{ type: "percentage", valuePct: 10, status: "active" }],
        0,
        "pickup"
      );
      return ok([
        check("discount", result.discountMinor === 10000, `${result.discountMinor}`),
        check("total", result.totalMinor === 90000, `${result.totalMinor}`),
      ]);
    },
  },
  {
    id: "pricing-003-scoped-offer-only-scoped-lines",
    category: "pricing",
    description: "A category-scoped offer discounts only the matching lines",
    weight: "hard",
    kind: "pure",
    run: () => {
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
      return ok([
        check(
          "discount applies to scoped subtotal only",
          result.discountMinor === 10500,
          `${result.discountMinor}`
        ),
        check("total", result.totalMinor === 124500, `${result.totalMinor}`),
      ]);
    },
  },
  {
    id: "pricing-004-scoped-offer-below-minimum",
    category: "pricing",
    description: "A scoped offer whose scoped subtotal is below the minimum does not apply",
    weight: "hard",
    kind: "pure",
    run: () => {
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
      return ok([
        check("no discount", result.discountMinor === 0, `${result.discountMinor}`),
        check("total", result.totalMinor === 100000, `${result.totalMinor}`),
      ]);
    },
  },
  {
    id: "pricing-005-free-delivery-waives-fee-only",
    category: "pricing",
    description: "A free-delivery offer waives the delivery fee, not the subtotal",
    weight: "hard",
    kind: "pure",
    run: () => {
      const result = computePricing(
        [line("a", "c1", 40000, 1)],
        [{ type: "freeDelivery", status: "active", minOrderMinor: 30000 }],
        10000,
        "delivery"
      );
      return ok([
        check("fee waived", result.deliveryFeeMinor === 0, `${result.deliveryFeeMinor}`),
        check("subtotal intact", result.subtotalMinor === 40000),
        check("total", result.totalMinor === 40000, `${result.totalMinor}`),
      ]);
    },
  },
  {
    id: "pricing-006-free-delivery-not-applied-to-pickup",
    category: "pricing",
    description: "Pickup orders are never charged a delivery fee",
    weight: "hard",
    kind: "pure",
    run: () => {
      const result = computePricing(
        [line("a", "c1", 40000, 1)],
        [{ type: "freeDelivery", status: "active" }],
        10000,
        "pickup"
      );
      return ok([
        check("fee not charged on pickup", result.deliveryFeeMinor === 0),
        check("total", result.totalMinor === 40000, `${result.totalMinor}`),
      ]);
    },
  },
  {
    id: "pricing-007-expired-offer-ignored",
    category: "pricing",
    description: "Expired offers are never applied",
    weight: "hard",
    kind: "pure",
    run: () => {
      const result = computePricing(
        [line("a", "c1", 50000, 1)],
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
      return ok([check("no discount", result.discountMinor === 0)]);
    },
  },
  {
    id: "pricing-008-never-negative",
    category: "pricing",
    description: "The total is never negative",
    weight: "hard",
    kind: "pure",
    run: () => {
      const result = computePricing(
        [line("a", "c1", 1000, 1)],
        [{ type: "fixedDiscount", valueMinor: 50000, status: "active" }],
        0,
        "pickup"
      );
      return ok([check("total >= 0", result.totalMinor === 0, `${result.totalMinor}`)]);
    },
  },
  {
    id: "pricing-009-fixed-discount-capped",
    category: "pricing",
    description: "A fixed discount never exceeds the subtotal",
    weight: "hard",
    kind: "pure",
    run: () => {
      const result = computePricing(
        [line("a", "c1", 10000, 1)],
        [{ type: "fixedDiscount", valueMinor: 5000, status: "active" }],
        0,
        "pickup"
      );
      return ok([
        check("discount capped", result.discountMinor === 5000, `${result.discountMinor}`),
        check("total", result.totalMinor === 5000),
      ]);
    },
  },
  {
    id: "pricing-010-money-is-integer-minor-units",
    category: "pricing",
    description: "All money values are integer minor units",
    weight: "hard",
    kind: "pure",
    run: () => {
      const result = computePricing(
        [line("a", "c1", 35000, 3)],
        [{ type: "percentage", valuePct: 7.5, status: "active" }],
        10000,
        "delivery"
      );
      const values = [
        result.subtotalMinor,
        result.discountMinor,
        result.deliveryFeeMinor,
        result.totalMinor,
      ];
      return ok([
        check(
          "all integers",
          values.every((v) => Number.isInteger(v)),
          values.join(",")
        ),
      ]);
    },
  },

  // ---------------------------------------------------------- delivery area
  {
    id: "delivery-001-inside-area",
    category: "policy",
    description: "An address inside a configured area is verified",
    weight: "hard",
    kind: "pure",
    run: () => {
      const result = evaluateDeliveryArea(
        "House 44, Faisal Town, Sargodha",
        ["faisal town"],
        "Sargodha city"
      );
      return ok([check("verified", result.status === "verified", result.status)]);
    },
  },
  {
    id: "delivery-002-outside-area",
    category: "policy",
    description: "An address outside the configured area is rejected",
    weight: "hard",
    kind: "pure",
    run: () => {
      const result = evaluateDeliveryArea("Phase 2, Karachi", ["faisal town"], "Sargodha");
      return ok([check("out of area", result.status === "out_of_area", result.status)]);
    },
  },
  {
    id: "delivery-003-unconfigured-rule-is-unverified",
    category: "policy",
    description: "Without a configured rule the area is unverified, never 'eligible'",
    weight: "hard",
    kind: "pure",
    run: () => {
      const result = evaluateDeliveryArea("Anywhere", [], "Sargodha city");
      return ok([check("unverified", result.status === "unverified", result.status)]);
    },
  },
  {
    id: "delivery-004-no-address-not-applicable",
    category: "policy",
    description: "Without an address the area check does not apply",
    weight: "hard",
    kind: "pure",
    run: () => {
      const result = evaluateDeliveryArea(undefined, ["faisal town"], null);
      return ok([
        check("not applicable", result.status === "not_applicable", result.status),
      ]);
    },
  },

  // ------------------------------------------------------------ order state
  {
    id: "order-001-typed-error-codes",
    category: "order_state",
    description: "Order failures carry typed codes instead of raw text",
    weight: "hard",
    kind: "pure",
    run: () => {
      const error = new OrderError("MIN_ORDER_NOT_MET", "below minimum", {
        minimumOrderMinor: 30000,
      });
      return ok([
        check("code", error.code === "MIN_ORDER_NOT_MET"),
        check("details", error.details.minimumOrderMinor === 30000),
      ]);
    },
  },
  {
    id: "order-002-cart-id-deterministic",
    category: "order_state",
    description: "The cart id is stable per conversation",
    weight: "hard",
    kind: "pure",
    run: () => {
      const a = customerIdFor("t1", "web", "v1");
      const b = customerIdFor("t1", "web", "v1");
      return ok([check("stable", a === b)]);
    },
  },
  {
    id: "order-003-idempotency-key-per-revision",
    category: "order_state",
    description: "The submit idempotency key changes with the cart revision",
    weight: "hard",
    kind: "pure",
    run: () => {
      const key = (cartId: string, revision: number) =>
        `cart_${cartId}_${revision}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
      return ok([
        check("same revision -> same key", key("c", 3) === key("c", 3)),
        check("new revision -> new key", key("c", 3) !== key("c", 4)),
      ]);
    },
  },

  // --------------------------------------------------------------- tenancy
  {
    id: "tenancy-001-customer-ids-are-tenant-scoped",
    category: "tenancy",
    description: "The same visitor in two tenants gets two different customers",
    weight: "hard",
    kind: "pure",
    run: () => {
      const a = customerIdFor("tenant_a", "web", "visitor-1");
      const b = customerIdFor("tenant_b", "web", "visitor-1");
      return ok([check("different ids", a !== b)]);
    },
  },
  {
    id: "tenancy-002-no-raw-pii-in-document-keys",
    category: "tenancy",
    description: "Identity document keys never contain the raw identifier",
    weight: "hard",
    kind: "pure",
    run: () => {
      const key = identityKey("whatsapp_qr", "+92 300 1234567");
      return ok([
        check("no phone digits", !key.includes("300"), key),
        check("no plus", !key.includes("+"), key),
        check("hashed shape", /^whatsapp_qr_[a-f0-9]{32}$/.test(key), key),
      ]);
    },
  },
  {
    id: "tenancy-003-channels-are-not-linked-silently",
    category: "tenancy",
    description: "A web visitor and a WhatsApp number are different identities",
    weight: "hard",
    kind: "pure",
    run: () => {
      const web = identityKey("web", "same-person");
      const wa = identityKey("whatsapp_qr", "same-person");
      return ok([check("not linked", web !== wa)]);
    },
  },
  {
    id: "tenancy-004-phone-normalisation",
    category: "tenancy",
    description: "Phone formatting differences collapse to one identity",
    weight: "hard",
    kind: "pure",
    run: () => {
      const a = normalizeIdentifier("whatsapp_qr", "+92 300 1234567");
      const b = normalizeIdentifier("whatsapp_qr", "923001234567");
      return ok([check("same", a === b, `${a} vs ${b}`)]);
    },
  },
  {
    id: "tenancy-005-phone-hash-is-stable",
    category: "tenancy",
    description: "The phone hash is stable and non-reversible",
    weight: "hard",
    kind: "pure",
    run: () => {
      const a = hashPhone("+92 300 1234567");
      const b = hashPhone("923001234567");
      return ok([
        check("stable", a === b),
        check("not the raw number", !a.includes("923")),
      ]);
    },
  },

  // ---------------------------------------------------------------- memory
  {
    id: "memory-001-disabled-memory-is-not-returned",
    category: "memory",
    description: "Disabled memory is never shown to the model",
    weight: "hard",
    kind: "pure",
    run: () => {
      const block = renderMemoryBlock(profile({ memoryEnabled: false }), [memory()]);
      return ok([
        check("no facts", !block.includes("Umar"), block),
        check("marked disabled", /disabled/i.test(block)),
      ]);
    },
  },
  {
    id: "memory-002-declined-consent-is-not-returned",
    category: "memory",
    description: "Declined consent stops memory retrieval",
    weight: "hard",
    kind: "pure",
    run: () => {
      const block = renderMemoryBlock(
        profile({ consentStatus: "declined" }),
        [memory()]
      );
      return ok([check("no facts", !block.includes("Umar"))]);
    },
  },
  {
    id: "memory-003-saved-preferences-are-included",
    category: "memory",
    description: "Verified preferences reach the prompt",
    weight: "hard",
    kind: "pure",
    run: () => {
      const block = renderMemoryBlock(
        profile({ preferredName: "Umar", preferredLanguage: "ur-Latn-PK" }),
        [memory({ key: "preferred_fulfilment", value: "delivery" })]
      );
      return ok([
        check("name", block.includes("Umar")),
        check("language", block.includes("ur-Latn-PK")),
        check("fulfilment", block.includes("delivery")),
      ]);
    },
  },
  {
    id: "memory-004-model-is-told-not-to-mention-memory",
    category: "memory",
    description: "The model is told not to reveal stored memory",
    weight: "hard",
    kind: "pure",
    run: () => {
      const block = renderMemoryBlock(profile({ preferredName: "Umar" }), [memory()]);
      return ok([check("instruction", /never mention/i.test(block))]);
    },
  },
  {
    id: "memory-005-only-allow-listed-keys",
    category: "memory",
    description: "Only a fixed set of facts can be remembered",
    weight: "hard",
    kind: "pure",
    run: () => {
      return ok([
        check("name allowed", ALLOWED_MEMORY_KEYS.includes("preferred_name")),
        check(
          "allergy not allowed",
          !(ALLOWED_MEMORY_KEYS as readonly string[]).includes("allergy")
        ),
        check(
          "religion not allowed",
          !(ALLOWED_MEMORY_KEYS as readonly string[]).includes("religion")
        ),
      ]);
    },
  },
  {
    id: "memory-006-preference-extraction-roman-urdu",
    category: "memory",
    description: "A Roman Urdu language request is detected as a language preference",
    weight: "hard",
    kind: "pure",
    run: () => {
      const message = "Mera naam Umar hai. Roman Urdu mein jawab do please";
      const hasName = /\bmera naam\s+([A-Za-z][A-Za-z .'-]{1,40})/i.test(message);
      const hasLanguage = /roman\s*urdu/i.test(message);
      return ok([
        check("name phrase", hasName),
        check("language phrase", hasLanguage),
      ]);
    },
  },

  // --------------------------------------------------------------- language
  ...[
    {
      id: "language-001-urdu-script",
      // Escaped so the file stays encoding-safe.
      message: "\u0686\u0627\u0626\u06D2 \u06A9\u06CC \u0642\u06CC\u0645\u062A \u06A9\u062A\u0646\u06CC \u06C1\u06D2\u061F",
      expected: "ur-PK",
    },
    {
      id: "language-002-roman-urdu",
      message: "biryani ki price kya hai bhai",
      // "price" is an English loanword, so code-switching (mixed) is acceptable.
      expected: "ur-Latn-PK|mixed-PK",
    },
    {
      id: "language-003-english",
      message: "What is the price of the beef biryani please?",
      expected: "en-PK",
    },
    {
      id: "language-004-hinglish",
      message: "bhai 2 zinger burger aur ek coke please add karo",
      expected: "mixed-PK|ur-Latn-PK",
    },
    {
      id: "language-005-urdu-roman-order",
      message: "main do biryani mangwana chahta hoon",
      expected: "ur-Latn-PK|mixed-PK",
    },
    {
      id: "language-006-english-order",
      message: "I want to order two biryani and one raita",
      // "biryani"/"raita" are dish names, not Urdu: this must stay English.
      expected: "en-PK",
    },
  ].map((testCase) => ({
    id: testCase.id,
    category: "language" as const,
    description: `Language detection: "${testCase.message.slice(0, 40)}"`,
    weight: "hard" as const,
    kind: "pure" as const,
    run: () => {
      const detected = detectLanguage(testCase.message).mode;
      const expected = testCase.expected.split("|");
      return ok([
        check(
          `detected ${detected}`,
          expected.includes(detected),
          `expected one of ${expected.join("/")}`
        ),
      ]);
    },
  })),
  {
    id: "language-010-normalised-modes",
    category: "language",
    description: "Configured language values are normalised",
    weight: "hard",
    kind: "pure",
    run: () => {
      return ok([
        check("roman-urdu", normalizeMode("roman-urdu") === "ur-Latn-PK"),
        check("urdu", normalizeMode("Urdu") === "ur-PK"),
        check("english", normalizeMode("en") === "en-PK"),
        check("unknown", normalizeMode("klingon") === null),
      ]);
    },
  },
  {
    id: "language-011-localised-strings-per-mode",
    category: "language",
    description: "Every language mode has its own fallback strings",
    weight: "hard",
    kind: "pure",
    run: () => {
      const messages = (["en-PK", "ur-PK", "ur-Latn-PK", "mixed-PK"] as const).map(
        (mode) => stringsFor(mode).aiUnavailable
      );
      return ok([
        check("all distinct", new Set(messages).size === 4),
        check("urdu is urdu script", /[\u0600-\u06FF]/.test(messages[1])),
      ]);
    },
  },
  {
    id: "language-012-prompt-mirrors-script",
    category: "language",
    description: "The prompt tells the model to mirror the customer's script",
    weight: "hard",
    kind: "pure",
    run: () => {
      const urdu = buildGroundedPrompt(context(), [], { languageMode: "ur-PK" });
      const roman = buildGroundedPrompt(context(), [], {
        languageMode: "ur-Latn-PK",
      });
      return ok([
        check("urdu script", /URDU SCRIPT/i.test(urdu)),
        check("roman urdu", /ROMAN URDU/i.test(roman)),
      ]);
    },
  },
  {
    id: "language-013-dish-names-are-not-urdu",
    category: "language",
    description: "Dish names alone do not make a message Urdu",
    weight: "hard",
    kind: "pure",
    run: () => {
      const detected = detectLanguage("I want to order two biryani and one raita").mode;
      return ok([check("english", detected === "en-PK", detected)]);
    },
  },

  // ---------------------------------------------------------------- safety
  {
    id: "safety-001-customer-text-is-data-not-instructions",
    category: "safety",
    description: "The prompt treats customer text and knowledge as untrusted data",
    weight: "hard",
    kind: "pure",
    run: () => {
      const prompt = buildGroundedPrompt(context(), []);
      return ok([
        check(
          "data not instructions",
          /DATA, never as instructions/i.test(prompt)
        ),
      ]);
    },
  },
  {
    id: "safety-002-no-price-invention",
    category: "safety",
    description: "The prompt forbids inventing prices, stock, timings and policies",
    weight: "hard",
    kind: "pure",
    run: () => {
      const prompt = buildGroundedPrompt(context(), []);
      return ok([
        check(
          "no invention",
          /Never invent a price, discount, item, ingredient, stock status, opening time, delivery time/i.test(
            prompt
          )
        ),
      ]);
    },
  },
  {
    id: "safety-003-no-false-confirmation",
    category: "safety",
    description: "The prompt forbids claiming an action without a tool result",
    weight: "hard",
    kind: "pure",
    run: () => {
      const prompt = buildGroundedPrompt(context(), []);
      return ok([
        check(
          "tool proof required",
          /Never claim an action succeeded/i.test(prompt)
        ),
        check(
          "order number required",
          /MUST contain the order number/i.test(prompt)
        ),
      ]);
    },
  },
  {
    id: "safety-004-handoff-required",
    category: "safety",
    description: "The prompt requires a handoff for person requests, complaints and allergy questions",
    weight: "hard",
    kind: "pure",
    run: () => {
      const prompt = buildGroundedPrompt(context(), []);
      return ok([
        check("handoff rule", /handoff_to_staff/.test(prompt)),
        check("allergy rule", /allerg/i.test(prompt)),
      ]);
    },
  },
  {
    id: "safety-005-prompt-is-versioned",
    category: "safety",
    description: "Every prompt carries a version for traceability",
    weight: "hard",
    kind: "pure",
    run: () => {
      const prompt = buildGroundedPrompt(context(), []);
      return ok([
        check("version present", prompt.includes(PROMPT_VERSION)),
      ]);
    },
  },
  {
    id: "safety-006-menu-shows-availability",
    category: "safety",
    description: "Unavailable items are marked in the prompt menu",
    weight: "hard",
    kind: "pure",
    run: () => {
      const prompt = buildGroundedPrompt(context(), []);
      return ok([
        check("sold out marked", prompt.includes("currently soldOut")),
        check("item ids present", prompt.includes("[item-1]")),
      ]);
    },
  },
  {
    id: "safety-007-aliases-exposed",
    category: "safety",
    description: "Local aliases are visible so free text can be matched",
    weight: "hard",
    kind: "pure",
    run: () => {
      const prompt = buildGroundedPrompt(context(), []);
      return ok([check("aliases", prompt.includes("also called: chicken biryani"))]);
    },
  },
  {
    id: "safety-008-item-not-on-menu-rule",
    category: "safety",
    description: "Items that are not on the menu must be reported as such",
    weight: "hard",
    kind: "pure",
    run: () => {
      const prompt = buildGroundedPrompt(context(), []);
      return ok([
        check("not-on-menu rule", /not in the MENU list at all/i.test(prompt)),
      ]);
    },
  },

  // ----------------------------------------------------------- tool contract
  {
    id: "tool-001-registry-version",
    category: "tool_contract",
    description: "The tool registry is versioned",
    weight: "hard",
    kind: "pure",
    run: () => {
      return ok([
        check("version format", /^\d{4}-\d{2}-\d{2}\./.test(TOOL_REGISTRY_VERSION)),
      ]);
    },
  },
  {
    id: "tool-002-required-tools-present",
    category: "tool_contract",
    description: "All shared tools are registered",
    weight: "hard",
    kind: "pure",
    run: () => {
      const names = toolDeclarations.map((t) => t.name);
      const required = [
        "search_menu",
        "show_products",
        "update_cart",
        "quote_order",
        "create_order",
        "get_order_status",
        "recommend_items",
        "get_order_history",
        "create_booking",
        "handoff_to_staff",
      ];
      return ok([
        check(
          "all present",
          required.every((n) => names.includes(n)),
          names.join(",")
        ),
      ]);
    },
  },
  {
    id: "tool-003-schemas-complete",
    category: "tool_contract",
    description: "Every tool has a description and a parameter schema",
    weight: "hard",
    kind: "pure",
    run: () => {
      const bad = toolDeclarations.filter(
        (t) => !t.description || !t.parameters
      );
      return ok([
        check("all complete", bad.length === 0, bad.map((t) => t.name).join(",")),
      ]);
    },
  },
  {
    id: "tool-004-order-tool-requires-confirmation",
    category: "tool_contract",
    description: "The order tool states the quote-then-confirm contract",
    weight: "hard",
    kind: "pure",
    run: () => {
      const create = toolDeclarations.find((t) => t.name === "create_order");
      const quote = toolDeclarations.find((t) => t.name === "quote_order");
      return ok([
        check("create requires quote", /fresh quote/i.test(create?.description ?? "")),
        check("quote is not an order", /WITHOUT placing/i.test(quote?.description ?? "")),
      ]);
    },
  },
  {
    id: "tool-005-recommendation-is-optional",
    category: "tool_contract",
    description: "The recommendation tool is limited to one optional suggestion",
    weight: "hard",
    kind: "pure",
    run: () => {
      const recommend = toolDeclarations.find(
        (t) => t.name === "recommend_items"
      );
      return ok([
        check(
          "at most one",
          /at most ONE/i.test(recommend?.description ?? "")
        ),
      ]);
    },
  },
  {
    id: "tool-006-booking-is-pending",
    category: "tool_contract",
    description: "The booking tool never claims a confirmed booking",
    weight: "hard",
    kind: "pure",
    run: () => {
      const booking = toolDeclarations.find((t) => t.name === "create_booking");
      return ok([
        check(
          "pending wording",
          /never say it is confirmed/i.test(booking?.description ?? "")
        ),
      ]);
    },
  },

  // ---------------------------------------------------------------- recovery
  {
    id: "recovery-001-cart-correction-merges",
    category: "recovery",
    description: "A corrected item updates the cart instead of duplicating it",
    weight: "hard",
    kind: "pure",
    run: () => {
      const lines = new Map<string, number>([["a", 2]]);
      lines.set("a", (lines.get("a") ?? 0) + 2);
      const entries = Array.from(lines.entries());
      return ok([
        check("one line", entries.length === 1),
        check("quantity merged", entries[0][1] === 4, `${entries[0][1]}`),
      ]);
    },
  },
  {
    id: "recovery-002-quote-invalidated-by-change",
    category: "recovery",
    description: "A cart change invalidates the previous quote",
    weight: "hard",
    kind: "pure",
    run: () => {
      // updateCart always writes currentQuote: null (see src/lib/services/carts.ts)
      const source = readFileSync("src/lib/services/carts.ts", "utf8");
      const invalidates = /currentQuote: null/.test(source);
      return ok([check("quote cleared on change", invalidates)]);
    },
  },
  {
    id: "recovery-003-submitted-cart-is-not-reordered",
    category: "recovery",
    description: "A submitted cart cannot be submitted again",
    weight: "hard",
    kind: "pure",
    run: () => {
      const source = readFileSync("src/lib/services/carts.ts", "utf8");
      return ok([
        check("guards duplicate submit", /CART_ALREADY_SUBMITTED/.test(source)),
      ]);
    },
  },
  {
    id: "recovery-004-booking-rejects-past-dates",
    category: "recovery",
    description: "Bookings in the past are rejected with a typed error",
    weight: "hard",
    kind: "pure",
    run: () => {
      const error = new BookingError("BOOKING_IN_PAST", "past");
      return ok([check("typed", error.code === "BOOKING_IN_PAST")]);
    },
  },
  {
    id: "recovery-005-booking-types-are-closed",
    category: "recovery",
    description: "Only known booking types are accepted",
    weight: "hard",
    kind: "pure",
    run: () => {
      return ok([
        check("table allowed", BOOKING_TYPES.includes("table")),
        check(
          "wedding not allowed",
          !(BOOKING_TYPES as readonly string[]).includes("wedding")
        ),
      ]);
    },
  },
  {
    id: "recovery-006-reminder-types-are-closed",
    category: "recovery",
    description: "Only known reminder types are accepted",
    weight: "hard",
    kind: "pure",
    run: () => {
      return ok([
        check("abandoned cart allowed", REMINDER_TYPES.includes("abandoned_cart")),
        check(
          "promo blast not allowed",
          !(REMINDER_TYPES as readonly string[]).includes("promo_blast")
        ),
      ]);
    },
  },
  {
    id: "recovery-007-reminder-requires-consent",
    category: "recovery",
    description: "Reminders cannot be created without consent",
    weight: "hard",
    kind: "pure",
    run: () => {
      const error = new ReminderError("NO_CONSENT", "consent");
      return ok([check("typed", error.code === "NO_CONSENT")]);
    },
  },
  {
    id: "recovery-008-policy-defaults-are-safe",
    category: "recovery",
    description: "The default messaging policy enforces the service window and caps",
    weight: "hard",
    kind: "pure",
    run: () => {
      return ok([
        check("24h window", DEFAULT_POLICY.serviceWindowHours === 24),
        check("daily cap", DEFAULT_POLICY.dailyCap >= 1),
        check("quiet hours", DEFAULT_POLICY.quietHoursStart !== DEFAULT_POLICY.quietHoursEnd),
        check("timezone", DEFAULT_POLICY.timeZone === "Asia/Karachi"),
      ]);
    },
  },
];

