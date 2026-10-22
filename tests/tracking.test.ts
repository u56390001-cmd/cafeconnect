import { describe, expect, it, beforeAll } from "vitest";
import { createTrackingToken, verifyTrackingToken } from "@/lib/tracking/token";

beforeAll(() => {
  process.env.SECRET_ENCRYPTION_KEY =
    process.env.SECRET_ENCRYPTION_KEY ?? "test-only-signing-secret";
});

describe("tracking tokens", () => {
  it("verifies a token for the same tenant", () => {
    const token = createTrackingToken("tenant_a", "o_123");
    const result = verifyTrackingToken(token, "tenant_a");
    expect(result?.orderId).toBe("o_123");
  });

  it("rejects the same token for another tenant", () => {
    const token = createTrackingToken("tenant_a", "o_123");
    expect(verifyTrackingToken(token, "tenant_b")).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = createTrackingToken("tenant_a", "o_123");
    const [payload, signature] = token.split(".");
    const tampered = `${payload}x.${signature}`;
    expect(verifyTrackingToken(tampered, "tenant_a")).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyTrackingToken("", "tenant_a")).toBeNull();
    expect(verifyTrackingToken("abc", "tenant_a")).toBeNull();
    expect(verifyTrackingToken("a.b", "tenant_a")).toBeNull();
  });

  it("does not leak the order number or tenant in the token", () => {
    const token = createTrackingToken("tenant_a", "o_123");
    expect(token).not.toContain("tenant_a");
    expect(token).not.toContain("o_123");
  });

  it("creates a different token every time", () => {
    expect(createTrackingToken("tenant_a", "o_123")).not.toBe(
      createTrackingToken("tenant_a", "o_123")
    );
  });
});
