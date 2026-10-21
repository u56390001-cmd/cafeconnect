import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  normalizeMode,
  scriptInstruction,
  stringsFor,
} from "@/lib/ai/language";

describe("language detection", () => {
  it("detects Urdu script input", () => {
    const result = detectLanguage("کیا آپ کے پاس چائے ہے؟");
    expect(result.mode).toBe("ur-PK");
    expect(result.script).toBe("urdu");
  });

  it("detects Roman Urdu input", () => {
    const result = detectLanguage("kya aap ke paas chai hai? mujhe do chayee dena hai");
    expect(result.mode).toBe("ur-Latn-PK");
  });

  it("detects English input", () => {
    const result = detectLanguage("What is the price of the beef biryani please");
    expect(result.mode).toBe("en-PK");
  });

  it("detects mixed Hinglish input", () => {
    const result = detectLanguage("bhai 2 zinger burger aur ek coke please add karo");
    expect(["mixed-PK", "ur-Latn-PK"]).toContain(result.mode);
  });

  it("falls back to the tenant default when there is no signal", () => {
    const result = detectLanguage("1234", "ur-PK");
    expect(result.mode).toBe("ur-PK");
  });

  it("normalizes configured language values", () => {
    expect(normalizeMode("roman-urdu")).toBe("ur-Latn-PK");
    expect(normalizeMode("urdu")).toBe("ur-PK");
    expect(normalizeMode("english")).toBe("en-PK");
    expect(normalizeMode("nonsense")).toBeNull();
  });
});

describe("localized strings", () => {
  it("provides a distinct acknowledgement per language mode", () => {
    const en = stringsFor("en-PK").ack;
    const roman = stringsFor("ur-Latn-PK").ack;
    const urdu = stringsFor("ur-PK").ack;
    expect(new Set([en, roman, urdu]).size).toBe(3);
  });

  it("keeps the Urdu-script strings in Urdu script", () => {
    expect(/[\u0600-\u06FF]/.test(stringsFor("ur-PK").aiUnavailable)).toBe(true);
  });

  it("gives a script instruction for every mode", () => {
    for (const mode of ["en-PK", "ur-PK", "ur-Latn-PK", "mixed-PK"] as const) {
      expect(scriptInstruction(mode).length).toBeGreaterThan(10);
    }
  });
});
