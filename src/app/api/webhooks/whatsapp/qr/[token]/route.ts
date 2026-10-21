import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/response";
import { handleQrWebhook } from "@/lib/whatsapp/qr-webhook";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
): Promise<Response> {
  try {
    return await handleQrWebhook(request, params.token);
  } catch (error: unknown) {
    return handleApiError("api/webhooks/whatsapp/qr/[token]", error);
  }
}
