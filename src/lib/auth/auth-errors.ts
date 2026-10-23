export const AUTH_ERROR_MESSAGES: Array<[string, string]> = [
  [
    "email-already-exists",
    "An account with this email already exists. Try signing in.",
  ],
  [
    "already been registered",
    "An account with this email already exists. Try signing in.",
  ],
  [
    "already registered",
    "An account with this email already exists. Try signing in.",
  ],
  [
    "email not confirmed",
    "Account not confirmed — check your inbox for a confirmation link. If you are a migrated user, sign in with your new password or reset it.",
  ],
  ["provider is not enabled", "Google sign-in is not configured for this app yet. Please sign in with email and password."],
  ["operation-not-allowed", "This sign-in method is currently unavailable."],
  ["too many requests", "Too many attempts. Please try again later."],
  ["user-not-found", "Invalid email or password."],
  ["email-not-found", "Invalid email or password."],
  ["wrong-password", "Invalid email or password."],
  ["invalid login credentials", "Invalid email or password."],
  ["invalid-credential", "Invalid email or password."],
  ["invalid-email", "Please enter a valid email address."],
  ["weak-password", "Password must be at least 6 characters."],
  [
    "popup-closed-by-user",
    "Google sign-in was closed before it completed.",
  ],
  [
    "popup-blocked",
    "Your browser blocked the sign-in popup. Allow popups and try again.",
  ],
];

export function friendlyAuthErrorMessage(error: unknown): string {
  const text =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : String(error ?? "");
  const lower = text.toLowerCase();
  for (const [needle, friendly] of AUTH_ERROR_MESSAGES) {
    if (lower.includes(needle)) return friendly;
  }
  return "An unexpected error occurred. Please try again.";
}
