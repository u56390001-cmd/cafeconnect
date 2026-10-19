import { NextRequest, NextResponse } from "next/server";

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
