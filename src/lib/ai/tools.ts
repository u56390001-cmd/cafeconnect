import { createHash } from "crypto";
import {
  FunctionDeclarationSchemaType,
  type FunctionDeclaration,
} from "@google/generative-ai";
import { createOrder } from "@/lib/services/orders";
import { tenantCollection } from "@/lib/tenancy/resolver";

export interface ToolContext {
  tenantId: string;
  channel: "web" | "whatsapp_meta" | "whatsapp_qr";
  conversationId: string;
  customerReference: string;
  currency: string;
}

export interface ToolOutcome {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

const createOrderDeclaration = {
  name: "create_order",
  description:
    "Books a real order for the business. Use this ONLY when the customer has given every required detail: the items with quantities, their name, their phone number, and for delivery the full address. The tool prices the order from the real menu, applies eligible offers and stores the order. If the tool returns an error, tell the customer what is missing and do not claim the order is placed.",
  parameters: {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: {
      items: {
        type: FunctionDeclarationSchemaType.ARRAY,
        description: "Items to order, using the exact itemId values from the menu list.",
        items: {
          type: FunctionDeclarationSchemaType.OBJECT,
          properties: {
            itemId: { type: FunctionDeclarationSchemaType.STRING },
            quantity: { type: FunctionDeclarationSchemaType.INTEGER },
          },
          required: ["itemId", "quantity"],
        },
      },
      customerName: { type: FunctionDeclarationSchemaType.STRING },
      customerPhone: {
        type: FunctionDeclarationSchemaType.STRING,
        description: "Phone number with country code, digits only (e.g. 923001234567).",
      },
      fulfilmentType: {
        type: FunctionDeclarationSchemaType.STRING,
        enum: ["delivery", "pickup"],
      },
      address: {
        type: FunctionDeclarationSchemaType.STRING,
        description: "Full delivery address. Required when fulfilmentType is delivery.",
      },
      notes: { type: FunctionDeclarationSchemaType.STRING },
    },
    required: ["items", "customerName", "customerPhone", "fulfilmentType"],
  },
};

const orderStatusDeclaration = {
  name: "get_order_status",
  description:
    "Returns the status of a previously placed order. Requires the order number and the same phone number used when ordering. Use this when the customer asks about an existing order.",
  parameters: {
    type: FunctionDeclarationSchemaType.OBJECT,
    properties: {
      orderNumber: { type: FunctionDeclarationSchemaType.STRING },
      customerPhone: { type: FunctionDeclarationSchemaType.STRING },
    },
    required: ["orderNumber", "customerPhone"],
  },
};

export const toolDeclarations: FunctionDeclaration[] = [
  createOrderDeclaration,
  orderStatusDeclaration,
];

function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/[^\d]/g, "");
}

function idempotencyKeyFor(
  context: ToolContext,
  args: Record<string, unknown>
): string {
  const payload = JSON.stringify({
    items: args.items,
    phone: args.customerPhone,
    type: args.fulfilmentType,
  });
  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 20);
  const safeConv = context.conversationId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20);
  return `ai_${safeConv}_${hash}`;
}

async function runCreateOrder(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolOutcome> {
  const rawItems = Array.isArray(args.items) ? args.items : [];
  if (rawItems.length === 0) {
    return { ok: false, error: "No items were provided for the order." };
  }

  const items = rawItems.map((entry) => {
    const item = entry as { itemId?: unknown; quantity?: unknown };
    return {
      itemId: String(item.itemId ?? ""),
      quantity: Number(item.quantity ?? 0),
    };
  });

  const customerPhone = normalizePhone(args.customerPhone);
  const fulfilmentType = args.fulfilmentType === "pickup" ? "pickup" : "delivery";
  const address =
    typeof args.address === "string" ? args.address.trim() : undefined;

  try {
    const result = await createOrder({
      tenantId: context.tenantId,
      items,
      customerName: String(args.customerName ?? "").trim(),
      customerPhone,
      fulfilmentType,
      address,
      notes: typeof args.notes === "string" ? args.notes : undefined,
      idempotencyKey: idempotencyKeyFor(context, {
        ...args,
        customerPhone,
        fulfilmentType,
      }),
      channel: context.channel,
    });

    const money = (minor: number) =>
      `${context.currency} ${(minor / 100).toFixed(0)}`;

    return {
      ok: true,
      data: {
        orderNumber: result.orderNumber,
        orderId: result.orderId,
        currency: context.currency,
        // Display strings are authoritative - the assistant must repeat them
        // exactly instead of doing its own arithmetic.
        totalLabel: money(result.pricing.totalMinor),
        subtotalLabel: money(result.pricing.subtotalMinor),
        discountLabel: money(result.pricing.discountMinor),
        deliveryFeeLabel: money(result.pricing.deliveryFeeMinor),
        totalMinor: result.pricing.totalMinor,
        subtotalMinor: result.pricing.subtotalMinor,
        discountMinor: result.pricing.discountMinor,
        deliveryFeeMinor: result.pricing.deliveryFeeMinor,
        appliedOffer: result.pricing.appliedOfferName,
        duplicate: result.duplicate,
      },
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Could not create the order";
    return { ok: false, error: message };
  }
}

async function runGetOrderStatus(
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolOutcome> {
  const orderNumber = String(args.orderNumber ?? "").trim().toUpperCase();
  const phone = normalizePhone(args.customerPhone);

  if (!orderNumber || !phone) {
    return { ok: false, error: "Order number and phone number are required." };
  }

  const snap = await tenantCollection(context.tenantId, "orders").get();
  const match = snap.docs.find(
    (doc) => String(doc.data().orderNumber ?? "").toUpperCase() === orderNumber
  );

  if (!match) {
    return { ok: false, error: "No order was found with that number." };
  }

  const data = match.data()!;
  const orderPhone = normalizePhone(data.customer?.phone);
  if (orderPhone !== phone) {
    return { ok: false, error: "The phone number does not match this order." };
  }

  return {
    ok: true,
    data: {
      orderNumber: data.orderNumber,
      status: data.status,
      paymentStatus: data.paymentStatus,
      totalLabel: `${data.currency ?? context.currency} ${(
        Number(data.totalMinor ?? 0) / 100
      ).toFixed(0)}`,
      totalMinor: data.totalMinor ?? 0,
      currency: data.currency ?? context.currency,
      itemCount: (data.items ?? []).reduce(
        (sum: number, item: { quantity?: number }) => sum + Number(item.quantity ?? 0),
        0
      ),
    },
  };
}

export async function runTool(
  name: string,
  rawArgs: unknown,
  context: ToolContext
): Promise<ToolOutcome> {
  const args =
    rawArgs && typeof rawArgs === "object"
      ? (rawArgs as Record<string, unknown>)
      : {};

  if (name === "create_order") {
    return runCreateOrder(args, context);
  }
  if (name === "get_order_status") {
    return runGetOrderStatus(args, context);
  }
  return { ok: false, error: `Unknown tool: ${name}` };
}

