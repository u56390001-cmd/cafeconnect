import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Shared rate limiting.
 *
 * The in-memory limiter resets on every cold start and is not shared between
 * serverless instances, so public endpoints use this Firestore-backed counter
 * as the source of truth. The in-memory limiter stays as a fast pre-filter.
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
  const ref = getAdminDb().collection("rateLimits").doc(docId);

  try {
    const result = await getAdminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists
        ? (snap.data() as CounterDocument)
        : { count: 0, windowStart: now, expiresAt: new Date(now + 5 * WINDOW_MS) };
      const next = (data.count ?? 0) + 1;
      tx.set(
        ref,
        {
          count: next,
          windowStart: data.windowStart ?? now,
          expiresAt: new Date(now + 5 * WINDOW_MS),
        },
        { merge: true }
      );
      return next;
    });

    return {
      allowed: result <= limit,
      remaining: Math.max(0, limit - result),
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
