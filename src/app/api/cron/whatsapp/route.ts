import { NextRequest, NextResponse } from "next/server";
import { drainInbox } from "@/lib/whatsapp/worker";
import { handleApiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const custom = request.headers.get("x-cron-secret");
  if (custom === secret) return true;

  return false;
}

/**
 * Cron endpoint.
 *
 * - Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`.
 * - An external scheduler (cron-job.org, UptimeRobot, GitHub Actions) can call
 *   the same URL with the header `x-cron-secret: <CRON_SECRET>`.
 *
 * It drains any inbound WhatsApp events that are still pending (for example if
 * the background run was interrupted) so no customer message is left unanswered.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    if (!authorized(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const results = await drainInbox(20);

    return NextResponse.json({
      processed: results.length,
      sent: results.filter((r) => r.status === "sent").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (error: unknown) {
    return handleApiError("api/cron/whatsapp", error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  return GET(request);
}
