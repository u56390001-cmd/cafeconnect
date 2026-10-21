import { requireTenantScope } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { listCustomers } from "@/lib/customers/identity";
import {
  deleteMemory,
  disableMemory,
  enableMemory,
  listMemories,
} from "@/lib/customers/memory";
import { customerMemorySummary } from "@/lib/customers/jobs";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const tenantId = new URL(request.url).searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");

    const customers = await listCustomers(ctx.tenantId);
    const withMemory = await Promise.all(
      customers.map(async (profile) => ({
        customerId: profile.customerId,
        preferredName: profile.preferredName,
        preferredLanguage: profile.preferredLanguage,
        preferredFulfilment: profile.preferredFulfilment,
        consentStatus: profile.consentStatus,
        memoryEnabled: profile.memoryEnabled,
        orderCount: profile.orderCount,
        lastSeenAt: profile.lastSeenAt,
        lastOrderAt: profile.lastOrderAt,
        memories: await customerMemorySummary(ctx.tenantId, profile.customerId),
      }))
    );

    return createApiResponse({ customers: withMemory });
  } catch (error: unknown) {
    return handleApiError("api/customers", error);
  }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = (await request.json()) as {
      tenantId?: string;
      customerId?: string;
      action?: "disable_memory" | "enable_memory" | "delete_memory";
      key?: string;
    };
    if (!body.tenantId || !body.customerId || !body.action) {
      return createApiError("Missing tenantId, customerId or action", 400);
    }

    const ctx = await requireTenantScope(body.tenantId, session.uid, "manage");

    if (body.action === "disable_memory") {
      await disableMemory(ctx.tenantId, body.customerId);
    } else if (body.action === "enable_memory") {
      await enableMemory(ctx.tenantId, body.customerId);
    } else {
      if (!body.key) return createApiError("Missing memory key", 400);
      await deleteMemory(ctx.tenantId, body.customerId, body.key);
    }

    const memories = await listMemories(ctx.tenantId, body.customerId);
    return createApiResponse({ customerId: body.customerId, memories });
  } catch (error: unknown) {
    return handleApiError("api/customers", error);
  }
}
