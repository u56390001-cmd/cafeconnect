import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Customer order tracking tokens.
 *
 * A tracking token is a high-entropy, HMAC-signed value that authorises one
 * order for one tenant. It never contains the order number, the phone number
 * or any other customer data, so a leaked URL cannot be guessed or reused
 * across tenants.
 */

const TOKEN_VERSION = "t1";

function secret(): string {
  const value =
    process.env.SECRET_ENCRYPTION_KEY ||
    process.env.CRON_SECRET ||
    process.env.GEMINI_API_KEY;
  if (!value) {
    throw new Error("Missing signing secret for tracking tokens");
  }
  return value;
}

function base64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** Creates a tracking token for an order. */
export function createTrackingToken(tenantId: string, orderId: string): string {
  const nonce = randomBytes(12).toString("hex");
  const payload = `${TOKEN_VERSION}:${tenantId}:${orderId}:${nonce}`;
  const signature = createHmac("sha256", secret())
    .update(payload)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${base64Url(Buffer.from(payload))}.${signature}`;
}

/** Verifies a token and returns the order it belongs to. */
export function verifyTrackingToken(
  token: string,
  tenantId: string
): { orderId: string } | null {
  if (!token || !token.includes(".")) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(
      encodedPayload.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
  } catch {
    return null;
  }

  // The payload must be in canonical form: base64 decoding can silently drop
  // trailing characters, so re-encoding has to match the token exactly.
  if (base64Url(Buffer.from(payload)) !== encodedPayload) {
    return null;
  }

  const parts = payload.split(":");
  if (parts.length !== 4) return null;
  const [version, tokenTenantId, orderId] = parts;
  if (version !== TOKEN_VERSION) return null;
  if (tokenTenantId !== tenantId) return null;

  const expected = createHmac("sha256", secret())
    .update(payload)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return { orderId };
}
