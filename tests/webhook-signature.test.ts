import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";

/** Mirrors the verification used by the QR webhook handler. */
function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!secret || !signatureHeader) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return a.equals(b);
}

describe("webhook signature verification", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ event: "message", id: "abc" });

  it("accepts a valid signature", () => {
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifySignature(body, signature, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifySignature(`${body} `, signature, secret)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const signature = `sha256=${createHmac("sha256", "other").update(body).digest("hex")}`;
    expect(verifySignature(body, signature, secret)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifySignature(body, null, secret)).toBe(false);
  });

  it("rejects when no secret is configured", () => {
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifySignature(body, signature, "")).toBe(false);
  });
});
