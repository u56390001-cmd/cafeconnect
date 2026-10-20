import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();

    // TODO: Verify webhook signature using WHATSAPP_APP_SECRET
    // TODO: Deduplicate by provider message ID
    // TODO: Map phone number to tenant via server-side integration records
    // TODO: Normalize inbound event and call shared AI orchestrator

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: unknown) {
    return handleApiError("api/webhooks/whatsapp/meta", error);
  }
}
