import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Shared rate limiting.
 *
 * The in-memory limiter resets on every cold start and is not shared between
 * serverless instances, so public endpoints use this Postgres-backed counter
 * (via the take_rate_limit rpc) as the source of truth. The in-memory
 * limiter stays as a fast pre-filter.
 */

const WINDOW_MS = 60_000;

interface CounterDocument {
  count: number;
  windowStart: number;
  expiresAt: Date;
}

function windowId(now: number): string {
  return String(Math.floor(now / WINDOW_MS));
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  scope: "shared" | "memory";
}

/**
 * Counts one request against a shared bucket. The counter document is keyed by
 * bucket + window so old windows never need cleanup.
 */
export async function consumeSharedLimit(
  bucket: string,
  limit: number,
  now = Date.now()
): Promise<RateLimitResult> {
  const key = `${bucket}:${windowId(now)}`;
  const docId = key.replace(/[^A-Za-z0-9_:-]/g, "_");

  try {
    // Atomic fixed-window increment performed by the take_rate_limit rpc
    // (row lock means concurrent requests serialize correctly).
    const incremented = await takeRateLimit(docId, limit);
    return {
      allowed: incremented.allowed,
      remaining: Math.max(0, limit - incremented.count),
      limit,
      scope: "shared",
    };
  } catch {
    // If the shared store is unavailable we fail open for the public chat
    // endpoints (the provider itself also rate limits) rather than blocking
    // customers.
    return { allowed: true, remaining: limit, limit, scope: "memory" };
  }
}

/** Atomic increment window guard. Returns {allowed, count} or throws. */
async function takeRateLimit(
  docId: string,
  limit: number
): Promise<{ allowed: boolean; count: number }> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/take_rate_limit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_key: docId,
        p_limit: limit,
        p_window_ms: WINDOW_MS,
      }),
      cache: "no-store",
    }
  );
  if (!response.ok) {
    throw new Error(`take_rate_limit failed: ${response.status}`);
  }
  const payload = (await response.json()) as {
    allowed: boolean;
    remaining: number;
  };
  return { allowed: payload.allowed, count: limit - payload.remaining };
}

/** Combines the fast in-memory filter with the shared counter. */
export async function checkSharedRateLimit(
  bucket: string,
  limit: number,
  memoryAllowed: boolean
): Promise<RateLimitResult> {
  if (!memoryAllowed) {
    return { allowed: false, remaining: 0, limit, scope: "memory" };
  }
  return consumeSharedLimit(bucket, limit);
}
