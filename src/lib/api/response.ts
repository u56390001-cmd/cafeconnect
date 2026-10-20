import { NextRequest, NextResponse } from "next/server";
import { UnauthorizedError } from "@/lib/tenancy/resolver";
import {
  AUTH_ERROR_MESSAGES,
  friendlyAuthErrorMessage,
} from "@/lib/auth/auth-errors";

export function createApiResponse<T>(
  data: T,
  status: number = 200
): NextResponse {
  return NextResponse.json(
    { success: true, data },
    { status, headers: { "Content-Type": "application/json" } }
  );
}

export function createApiError(
  message: string,
  status: number = 400,
  code?: string
): NextResponse {
  return NextResponse.json(
    { success: false, error: { message, code } },
    { status, headers: { "Content-Type": "application/json" } }
  );
}

export function getHeader(request: NextRequest, name: string): string | null {
  return request.headers.get(name) || null;
}

const SERVER_CONFIG_ERROR_HINTS = [
  "failed to parse private key",
  "invalid pem",
  "missing required firebase admin",
  "invalid private key",
  "invalid_grant",
  "unauthenticated",
];

export function handleApiError(scope: string, error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(`[api-error] scope=${scope} message="${message}"`, stack);

  if (error instanceof UnauthorizedError) {
    return createApiError(error.message, error.status);
  }

  const lower = message.toLowerCase();
  if (SERVER_CONFIG_ERROR_HINTS.some((hint) => lower.includes(hint))) {
    return createApiError(
      "Server authentication is not configured. Please add the Firebase service-account credentials to the environment and redeploy.",
      503
    );
  }

  const friendly = friendlyAuthErrorMessage(error);
  if (
    AUTH_ERROR_MESSAGES.some(([needle]) => lower.includes(needle)) &&
    friendly !== "An unexpected error occurred. Please try again."
  ) {
    return createApiError(friendly, 400);
  }

  return createApiError("Internal server error", 500);
}
