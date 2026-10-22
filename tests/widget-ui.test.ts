import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  sanitizeBranding,
  sanitizeHexColor,
  DEFAULT_BRANDING,
} from "@/lib/widget/service";
import { parseWidgetBlocks, looksLikeBrowseRequest } from "@/lib/widget/ui-contract";

describe("widget branding", () => {
  it("keeps valid hex colours and rejects everything else", () => {
    expect(sanitizeHexColor("#EA580C", "#000000")).toBe("#ea580c");
    expect(sanitizeHexColor("#f90", "#000000")).toBe("#f90");
    expect(sanitizeHexColor("javascript:alert(1)", "#000000")).toBe("#000000");
    expect(sanitizeHexColor("red", "#000000")).toBe("#000000");
    expect(sanitizeHexColor(42, "#000000")).toBe("#000000");
  });

  it("never lets a script url through as a logo", () => {
    const branding = sanitizeBranding({
      logoUrl: "javascript:alert(1)",
    });
    expect(branding.logoUrl).toBe("");
  });

  it("falls back to defaults for unknown enum values", () => {
    const branding = sanitizeBranding({
      themeMode: "neon",
      radius: "blob",
      launcherPosition: "top-center",
    });
    expect(branding.themeMode).toBe(DEFAULT_BRANDING.themeMode);
    expect(branding.radius).toBe(DEFAULT_BRANDING.radius);
    expect(branding.launcherPosition).toBe(DEFAULT_BRANDING.launcherPosition);
  });

  it("caps starter prompts and drops empty ones", () => {
    const branding = sanitizeBranding({
      starterPrompts: ["  Menu dikhao  ", "", "x".repeat(200), "a", "b", "c", "d", "e"],
    });
    expect(branding.starterPrompts.length).toBeLessThanOrEqual(6);
    expect(branding.starterPrompts[0]).toBe("Menu dikhao");
    expect(branding.starterPrompts.every((p) => p.length <= 80)).toBe(true);
  });

  it("computes a WCAG contrast ratio", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 2);
    // White on the default brand orange is below 4.5 but above 3.
    const ratio = contrastRatio("#ea580c", "#ffffff");
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(4.5);
  });
});

describe("browse intent", () => {
  it("recognises requests to see products", () => {
    expect(looksLikeBrowseRequest("Menu dikhao")).toBe(true);
    expect(looksLikeBrowseRequest("kya kya hai aapka menu")).toBe(true);
    expect(looksLikeBrowseRequest("burgers mein kya hai?")).toBe(true);
    expect(looksLikeBrowseRequest("drinks show karo")).toBe(true);
  });

  it("does not treat a plain question as a browse request", () => {
    expect(looksLikeBrowseRequest("Delivery charges kitne hain?")).toBe(false);
    expect(looksLikeBrowseRequest("")).toBe(false);
    expect(looksLikeBrowseRequest("a".repeat(200))).toBe(false);
  });
});

describe("widget response contract", () => {
  it("drops unknown block types", () => {
    const blocks = parseWidgetBlocks([
      { type: "text", text: "Hello" },
      { type: "definitely_not_a_block", text: "nope" },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("text");
  });

  it("keeps a product carousel and normalises its products", () => {
    const blocks = parseWidgetBlocks([
      {
        type: "product_carousel",
        products: [
          {
            itemId: "i1",
            name: "Zinger Burger",
            description: "Crispy chicken",
            priceMinor: 65000,
            priceLabel: "PKR 650",
            currency: "PKR",
            availability: "available",
            imageUrl: "/api/media/x",
            optionGroups: [],
          },
        ],
      },
    ]);
    expect(blocks[0].type).toBe("product_carousel");
    if (blocks[0].type === "product_carousel") {
      expect(blocks[0].products[0].name).toBe("Zinger Burger");
      expect(blocks[0].products[0].hasOptions).toBe(false);
    }
  });

  it("drops a product block without products", () => {
    const blocks = parseWidgetBlocks([{ type: "product_carousel", products: [] }]);
    expect(blocks).toHaveLength(0);
  });

  it("drops an order card without an order number", () => {
    const blocks = parseWidgetBlocks([
      { type: "order_confirmation", order: { orderNumber: "" } },
    ]);
    expect(blocks).toHaveLength(0);
  });

  it("caps the number of products and replies", () => {
    const products = Array.from({ length: 30 }, (_, index) => ({
      itemId: `i${index}`,
      name: `Item ${index}`,
      priceMinor: 100,
      priceLabel: "PKR 1",
      currency: "PKR",
      availability: "available",
      optionGroups: [],
    }));
    const blocks = parseWidgetBlocks([
      { type: "product_list", products },
      {
        type: "quick_replies",
        items: Array.from({ length: 20 }, (_, index) => ({
          id: `q${index}`,
          label: `Reply ${index}`,
        })),
      },
    ]);
    if (blocks[0].type === "product_list") {
      expect(blocks[0].products.length).toBeLessThanOrEqual(8);
    }
    if (blocks[1].type === "quick_replies") {
      expect(blocks[1].items.length).toBeLessThanOrEqual(4);
    }
  });

  it("ignores a non-array payload", () => {
    expect(parseWidgetBlocks("nope")).toEqual([]);
    expect(parseWidgetBlocks(null)).toEqual([]);
  });
});
