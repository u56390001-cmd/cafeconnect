/**
 * Safely extracts a user-facing message from an API response payload.
 *
 * The API envelope is `{ success, error: { message, code } }`; several callers
 * historically read `json.error` (an object) into a string state and crashed
 * rendering. Use this helper everywhere a payload is parsed after `res.json()`.
 */
export function extractApiErrorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof (payload.error as { message: unknown }).message === "string" &&
    (payload.error as { message: string }).message.trim() !== ""
  ) {
    return (payload.error as { message: string }).message;
  }
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof (payload as { message: unknown }).message === "string" &&
    (payload as { message: string }).message.trim() !== ""
  ) {
    return (payload as { message: string }).message;
  }
  return fallback;
}
