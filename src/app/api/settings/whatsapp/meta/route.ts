import { requireTenantScope, tenantDoc } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { getTenantApiKey } from "@/lib/settings/keys";
import { mapMetaPhoneNumberId } from "@/lib/whatsapp/mapping";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function metaGraphVersion(): string {
  return process.env.META_GRAPH_API_VERSION || "v20.0";
}

function webhookUrl(): string | null {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.QR_PROVIDER_WEBHOOK_BASE_URL ||
    ""
  ).trim();
  return base ? `${base.replace(/\/+$/, "")}/api/webhooks/whatsapp/meta` : null;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const tenantId = new URL(request.url).searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    await requireTenantScope(tenantId, session.uid, "manage");

    const settingsSnap = await tenantDoc(tenantId, "settings", "whatsapp").get();
    const settings = settingsSnap.data() ?? {};
    const tenantKey = await getTenantApiKey(tenantId, "meta_whatsapp");
    const platformToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    const token = tenantKey?.key ?? platformToken ?? null;
    const phoneNumberId = (settings.phoneNumberId as string) ?? null;

    let connection: "not_configured" | "connected" | "error" = "not_configured";
    let connectionDetail: string | null = null;

    if (token && phoneNumberId) {
      try {
        const res = await fetch(
          `https://graph.facebook.com/${metaGraphVersion()}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          display_phone_number?: string;
          verified_name?: string;
          error?: { message?: string };
        };
        if (res.ok) {
          connection = "connected";
          connectionDetail = `${data.verified_name ?? "Business"} · ${
            data.display_phone_number ?? phoneNumberId
          }`;
        } else {
          connection = "error";
          connectionDetail = data.error?.message ?? "Meta API rejected the request";
        }
      } catch {
        connection = "error";
        connectionDetail = "Meta API unreachable";
      }
    } else if (!token) {
      connectionDetail = "No access token saved";
    } else {
      connectionDetail = "No phone number id saved";
    }

    return createApiResponse({
      connection,
      connectionDetail,
      hasTenantToken: Boolean(tenantKey),
      usingPlatformToken: !tenantKey && Boolean(platformToken),
      phoneNumberId,
      verifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN?.trim()),
      appSecretConfigured: Boolean(process.env.WHATSAPP_APP_SECRET?.trim()),
      webhookUrl: webhookUrl(),
      graphVersion: metaGraphVersion(),
    });
  } catch (error: unknown) {
    return handleApiError("api/settings/whatsapp/meta", error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = (await request.json()) as {
      tenantId?: string;
      phoneNumberId?: string;
    };
    const tenantId = body.tenantId;
    if (!tenantId) return createApiError("Missing tenantId", 400);

    await requireTenantScope(tenantId, session.uid, "manage");

    const phoneNumberId = String(body.phoneNumberId ?? "").trim();
    if (!phoneNumberId) return createApiError("Missing phoneNumberId", 400);
    if (!/^[0-9]{6,25}$/.test(phoneNumberId)) {
      return createApiError("Invalid phone number id", 400);
    }

    await tenantDoc(tenantId, "settings", "whatsapp").set(
      {
        tenantId,
        provider: "meta_whatsapp",
        mode: "meta",
        phoneNumberId,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    await mapMetaPhoneNumberId(phoneNumberId, tenantId);

    return createApiResponse({ phoneNumberId, mapped: true });
  } catch (error: unknown) {
    return handleApiError("api/settings/whatsapp/meta", error);
  }
}
