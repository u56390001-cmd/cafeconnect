import { requireTenantScope, tenantDoc } from "@/lib/tenancy/resolver";
import { createApiResponse, createApiError, handleApiError } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const BUSINESS_TYPES = [
  "restaurant",
  "cafe",
  "foodStall",
  "bakery",
  "takeaway",
  "cloudKitchen",
  "homeChef",
  "catering",
];

interface BusinessPayload {
  businessName?: string;
  businessType?: string;
  phone?: string;
  address?: string;
  hours?: string;
  deliveryFeeMinor?: number;
  minimumOrderMinor?: number;
  deliveryArea?: string;
  pickupAvailable?: boolean;
  paymentMethods?: string;
  orderInstructions?: string;
  currency?: string;
  greeting?: string;
  tone?: string;
  language?: string;
  handoffNote?: string;
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, maxLength);
}

function cleanMoney(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 500_000_000) return undefined;
  return Math.round(num);
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const tenantId = new URL(request.url).searchParams.get("tenantId");
    if (!tenantId) return createApiError("Missing tenantId", 400);

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");

    const [profileSnap, deliverySnap, aiSnap] = await Promise.all([
      tenantDoc(ctx.tenantId, "profile", "main").get(),
      tenantDoc(ctx.tenantId, "settings", "delivery").get(),
      tenantDoc(ctx.tenantId, "settings", "ai").get(),
    ]);

    const profile = profileSnap.data() ?? {};
    const delivery = deliverySnap.data() ?? {};
    const ai = aiSnap.data() ?? {};

    return createApiResponse({
      businessName: profile.businessName ?? "",
      businessType: Array.isArray(profile.businessType)
        ? profile.businessType[0]
        : profile.businessType ?? "restaurant",
      phone: profile.phone ?? "",
      address: profile.address ?? "",
      hours: profile.hours ?? "",
      currency: profile.currency ?? "PKR",
      deliveryFeeMinor: delivery.deliveryFeeMinor ?? 0,
      minimumOrderMinor: delivery.minimumOrderMinor ?? 0,      deliveryArea: delivery.deliveryArea ?? "",
      pickupAvailable: delivery.pickupAvailable !== false,
      paymentMethods: delivery.paymentMethods ?? "Cash on delivery",
      orderInstructions: delivery.orderInstructions ?? "",
      greeting: ai.greeting ?? "",
      tone: ai.tone ?? "",
      language: ai.language ?? "en",
      handoffNote: ai.handoffNote ?? "",
    });
  } catch (error: unknown) {
    return handleApiError("api/settings/business", error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await getSession(request);
    if (!session) return createApiError("Unauthorized", 401);

    const body = (await request.json()) as BusinessPayload & {
      tenantId?: string;
    };
    const tenantId = body.tenantId;
    if (!tenantId) return createApiError("Missing tenantId", 400);

    const ctx = await requireTenantScope(tenantId, session.uid, "manage");

    const profileUpdate: Record<string, unknown> = { updatedAt: new Date() };
    const deliveryUpdate: Record<string, unknown> = { updatedAt: new Date() };
    const aiUpdate: Record<string, unknown> = { updatedAt: new Date() };

    const businessName = cleanText(body.businessName, 120);
    if (businessName !== undefined) profileUpdate.businessName = businessName;

    if (body.businessType !== undefined) {
      if (!BUSINESS_TYPES.includes(body.businessType)) {
        return createApiError("Invalid business type", 400);
      }
      profileUpdate.businessType = [body.businessType];
    }

    const phone = cleanText(body.phone, 40);
    if (phone !== undefined) profileUpdate.phone = phone;

    const address = cleanText(body.address, 300);
    if (address !== undefined) profileUpdate.address = address;

    const hours = cleanText(body.hours, 200);
    if (hours !== undefined) profileUpdate.hours = hours;

    const currency = cleanText(body.currency, 8);
    if (currency !== undefined) profileUpdate.currency = currency?.toUpperCase() || "PKR";

    const deliveryFeeMinor = cleanMoney(body.deliveryFeeMinor);
    if (deliveryFeeMinor !== undefined) {
      deliveryUpdate.deliveryFeeMinor = deliveryFeeMinor;
    }

    const minimumOrderMinor = cleanMoney(body.minimumOrderMinor);
    if (minimumOrderMinor !== undefined) {
      deliveryUpdate.minimumOrderMinor = minimumOrderMinor;
    }

    const deliveryArea = cleanText(body.deliveryArea, 300);
    if (deliveryArea !== undefined) deliveryUpdate.deliveryArea = deliveryArea;

    if (body.pickupAvailable !== undefined) {
      deliveryUpdate.pickupAvailable = Boolean(body.pickupAvailable);
    }

    const paymentMethods = cleanText(body.paymentMethods, 200);
    if (paymentMethods !== undefined) deliveryUpdate.paymentMethods = paymentMethods;

    const orderInstructions = cleanText(body.orderInstructions, 500);
    if (orderInstructions !== undefined) {
      deliveryUpdate.orderInstructions = orderInstructions;
    }

    const greeting = cleanText(body.greeting, 300);
    if (greeting !== undefined) aiUpdate.greeting = greeting;

    const tone = cleanText(body.tone, 200);
    if (tone !== undefined) aiUpdate.tone = tone;

    const language = cleanText(body.language, 10);
    if (language !== undefined) aiUpdate.language = language || "en";

    const handoffNote = cleanText(body.handoffNote, 300);
    if (handoffNote !== undefined) aiUpdate.handoffNote = handoffNote;

    await Promise.all([
      tenantDoc(ctx.tenantId, "profile", "main").set(profileUpdate, { merge: true }),
      tenantDoc(ctx.tenantId, "settings", "delivery").set(deliveryUpdate, {
        merge: true,
      }),
      tenantDoc(ctx.tenantId, "settings", "ai").set(aiUpdate, { merge: true }),
    ]);

    return createApiResponse({ saved: true });
  } catch (error: unknown) {
    return handleApiError("api/settings/business", error);
  }
}
