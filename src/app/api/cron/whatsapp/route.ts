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

    // Housekeeping: expire carts that were never confirmed, retry any memory
    // job whose background run was interrupted, and process due reminders.
    let expiredCarts = 0;
    let memoryJobs = { processed: 0, saved: 0 };
    let reminders = { processed: 0, sent: 0, suppressed: 0, failed: 0 };
    let abandoned = { detected: 0, scheduled: 0 };
    try {
      const { getAdminDb } = await import("@/lib/firebase/admin");
      const { expireStaleCarts } = await import("@/lib/services/carts");
      const { processPendingMemoryJobs } = await import("@/lib/customers/jobs");
      const {
        processDueReminders,
        detectAbandonedCarts,
      } = await import("@/lib/reminders/processor");
      const tenantsSnap = await getAdminDb().collection("tenants").get();
      for (const tenant of tenantsSnap.docs) {
        expiredCarts += await expireStaleCarts(tenant.id);
        const memory = await processPendingMemoryJobs(tenant.id, 10);
        memoryJobs.processed += memory.processed;
        memoryJobs.saved += memory.saved;
        const reminderResult = await processDueReminders(tenant.id);
        reminders.processed += reminderResult.processed;
        reminders.sent += reminderResult.sent;
        reminders.suppressed += reminderResult.suppressed;
        reminders.failed += reminderResult.failed;
        const abandonedResult = await detectAbandonedCarts(tenant.id);
        abandoned.detected += abandonedResult.detected;
        abandoned.scheduled += abandonedResult.scheduled;
      }
    } catch (error: unknown) {
      console.error(
        `[cron-error] scope=housekeeping message=${
          error instanceof Error ? error.message.slice(0, 160) : "unknown"
        }`
      );
    }

    return NextResponse.json({
      processed: results.length,
      sent: results.filter((r) => r.status === "sent").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
      expiredCarts,
      memoryJobs,
      reminders,
      abandoned,
      results,
    });
  } catch (error: unknown) {
    return handleApiError("api/cron/whatsapp", error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  return GET(request);
}
