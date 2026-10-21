import { check, ok, type EvalScenario } from "../types";
import { createOrder, findOrderByNumber, hashPhone } from "@/lib/services/orders";
import {
  ensureCart,
  quoteCart,
  submitCart,
  updateCart,
  cartIdForConversation,
} from "@/lib/services/carts";
import { resolveCustomer } from "@/lib/customers/identity";
import { listMemories, saveMemory, disableMemory } from "@/lib/customers/memory";
import { tenantDoc } from "@/lib/tenancy/resolver";

const TENANT = process.env.EVAL_TENANT_ID ?? "00wnUFnHmaFu7I3fASMh";

/** Cheapest available item regardless of the minimum order value. */
async function cheapestAvailableItem(
  tenantId: string
): Promise<{ itemId: string; priceMinor: number } | null> {
  const { getAdminDb } = await import("@/lib/firebase/admin");
  const snap = await getAdminDb()
    .collection(`tenants/${tenantId}/menuItems`)
    .where("publicationStatus", "==", "published")
    .limit(50)
    .get();
  const candidates = snap.docs
    .map((doc) => {
      const d = doc.data();
      return {
        itemId: String(d.itemId || doc.id),
        priceMinor: Number(d.basePriceMinor ?? 0),
        available: d.availability === "available",
      };
    })
    .filter((item) => item.available && item.priceMinor > 0)
    .sort((a, b) => a.priceMinor - b.priceMinor);
  return candidates[0] ?? null;
}

/**
 * Cheapest available item that satisfies the tenant's minimum order value
 * (so order tests place a real order), plus the cheapest item overall.
 */
async function affordableItem(
  tenantId: string
): Promise<{ itemId: string; priceMinor: number } | null> {
  const { getAdminDb } = await import("@/lib/firebase/admin");
  const [itemsSnap, settings] = await Promise.all([
    getAdminDb()
      .collection(`tenants/${tenantId}/menuItems`)
      .where("publicationStatus", "==", "published")
      .limit(50)
      .get(),
    tenantDoc(tenantId, "settings", "delivery").get(),
  ]);
  const minimum = Number(settings.data()?.minimumOrderMinor ?? 0);

  const candidates = itemsSnap.docs
    .map((doc) => {
      const d = doc.data();
      return {
        itemId: String(d.itemId || doc.id),
        priceMinor: Number(d.basePriceMinor ?? 0),
        available: d.availability === "available",
      };
    })
    .filter((item) => item.available && item.priceMinor > 0)
    .sort((a, b) => a.priceMinor - b.priceMinor);

  const eligible = candidates.find((item) => item.priceMinor >= minimum);
  return eligible ?? candidates[0] ?? null;
}

export const integrationScenarios: EvalScenario[] = [
  {
    id: "integration-001-tenant-isolation-customers",
    category: "tenancy",
    description: "Two tenants never share a customer profile",
    weight: "hard",
    kind: "integration",
    run: async () => {
      const other = `eval_tenant_${Date.now().toString(36)}`;
      const a = await resolveCustomer({
        tenantId: TENANT,
        channel: "web",
        identifier: "eval-visitor-1",
      });
      const b = await resolveCustomer({
        tenantId: other,
        channel: "web",
        identifier: "eval-visitor-1",
      });
      const checks = [
        check("different customer ids", a.customerId !== b.customerId),
        check("tenant scoped", a.customerId.startsWith("cust_")),
      ];
      return ok(checks);
    },
  },
  {
    id: "integration-002-memory-supersedes",
    category: "memory",
    description: "A newer fact supersedes the older one with the same key",
    weight: "hard",
    kind: "integration",
    run: async () => {
      const resolved = await resolveCustomer({
        tenantId: TENANT,
        channel: "web",
        identifier: `eval-memory-${Date.now().toString(36)}`,
      });
      await saveMemory({
        tenantId: TENANT,
        customerId: resolved.customerId,
        type: "preference",
        key: "preferred_name",
        value: "First Name",
        sourceType: "explicit",
      });
      await saveMemory({
        tenantId: TENANT,
        customerId: resolved.customerId,
        type: "preference",
        key: "preferred_name",
        value: "Second Name",
        sourceType: "explicit",
      });
      const active = (await listMemories(TENANT, resolved.customerId)).filter(
        (m) => m.key === "preferred_name"
      );
      return ok([
        check("only one active fact", active.length === 1, `${active.length}`),
        check("newest wins", active[0]?.value === "Second Name", active[0]?.value),
      ]);
    },
  },
  {
    id: "integration-003-memory-consent-off",
    category: "memory",
    description: "Disabling memory stops retrieval for that customer",
    weight: "hard",
    kind: "integration",
    run: async () => {
      const resolved = await resolveCustomer({
        tenantId: TENANT,
        channel: "web",
        identifier: `eval-consent-${Date.now().toString(36)}`,
      });
      await saveMemory({
        tenantId: TENANT,
        customerId: resolved.customerId,
        type: "preference",
        key: "preferred_name",
        value: "Consent Test",
        sourceType: "explicit",
      });
      await disableMemory(TENANT, resolved.customerId);
      const active = await listMemories(TENANT, resolved.customerId);
      return ok([
        check("consent disables retrieval", active.length === 0, `${active.length}`),
      ]);
    },
  },
  {
    id: "integration-004-cart-quote-and-submit",
    category: "order_state",
    description: "A cart can be quoted and submitted with an idempotent key",
    weight: "hard",
    kind: "integration",
    run: async () => {
      const cheapest = await affordableItem(TENANT);
      if (!cheapest) {
        return {
          passed: true,
          checks: [check("no item available - skipped", true)],
        };
      }
      const itemId = cheapest.itemId;
      const conversationId = `eval_conv_${Date.now().toString(36)}`;
      const cart = await ensureCart({
        tenantId: TENANT,
        conversationId,
        channel: "web",
        customerReference: "eval",
      });
      await updateCart({
        tenantId: TENANT,
        cartId: cart.cartId,
        operation: "add",
        items: [{ itemId, quantity: 1 }],
        fulfilmentType: "pickup",
        customerName: "Eval Customer",
        customerPhone: "03001234567",
        currency: "PKR",
      });
      const { quote } = await quoteCart({
        tenantId: TENANT,
        cartId: cart.cartId,
        currency: "PKR",
      });
      const first = await submitCart({
        tenantId: TENANT,
        cartId: cart.cartId,
        channel: "web",
        currency: "PKR",
      });
      const second = await submitCart({
        tenantId: TENANT,
        cartId: cart.cartId,
        channel: "web",
        currency: "PKR",
      });
      return ok([
        check("quote has a total", quote.totalMinor >= 0),
        check("order created", first.orderNumber.length > 0),
        check("retry returns same order", second.orderNumber === first.orderNumber, {
          first: first.orderNumber,
          second: second.orderNumber,
        } as unknown as string),
        check("retry marked duplicate", second.duplicate === true),
      ]);
    },
  },
  {
    id: "integration-005-order-status-lookup-is-indexed",
    category: "order_state",
    description: "Order lookup by number works through the index and verifies the phone",
    weight: "hard",
    kind: "integration",
    run: async () => {
      const cheapest = await affordableItem(TENANT);
      if (!cheapest) {
        return {
          passed: true,
          checks: [check("no item available - skipped", true)],
        };
      }
      const itemId = cheapest.itemId;
      const conversationId = `eval_conv_${Date.now().toString(36)}`;
      const cart = await ensureCart({
        tenantId: TENANT,
        conversationId,
        channel: "web",
        customerReference: "eval",
      });
      await updateCart({
        tenantId: TENANT,
        cartId: cart.cartId,
        operation: "add",
        items: [{ itemId, quantity: 1 }],
        fulfilmentType: "pickup",
        customerName: "Eval Customer",
        customerPhone: "03001234567",
        currency: "PKR",
      });
      await quoteCart({
        tenantId: TENANT,
        cartId: cart.cartId,
        currency: "PKR",
      });
      const order = await submitCart({
        tenantId: TENANT,
        cartId: cart.cartId,
        channel: "web",
        currency: "PKR",
      });
      const found = await findOrderByNumber(TENANT, order.orderNumber);
      return ok([
        check("index finds the order", found !== null),
        check(
          "phone hash stored",
          found?.phoneHash === hashPhone("03001234567"),
          found?.phoneHash
        ),
      ]);
    },
  },
  {
    id: "integration-006-min-order-is-enforced",
    category: "pricing",
    description: "An order below the tenant minimum is rejected by the backend",
    weight: "hard",
    kind: "integration",
    run: async () => {
      const { getAdminDb } = await import("@/lib/firebase/admin");
      const settings = await tenantDoc(
        TENANT,
        "settings",
        "delivery"
      ).get();
      const minimum = Number(settings.data()?.minimumOrderMinor ?? 0);
      if (minimum <= 0) {
        return {
          passed: true,
          checks: [check("tenant has no minimum configured - skipped", true)],
        };
      }
      const cheapest = await cheapestAvailableItem(TENANT);
      if (!cheapest) {
        return { passed: true, checks: [check("no item available - skipped", true)] };
      }
      if (cheapest.priceMinor >= minimum) {
        return {
          passed: true,
          checks: [
            check(
              "cheapest item is not below the minimum - nothing to reject",
              true
            ),
          ],
        };
      }
      const itemId = cheapest.itemId;
      const conversationId = `eval_conv_${Date.now().toString(36)}`;
      const cart = await ensureCart({
        tenantId: TENANT,
        conversationId,
        channel: "web",
        customerReference: "eval",
      });
      await updateCart({
        tenantId: TENANT,
        cartId: cart.cartId,
        operation: "add",
        items: [{ itemId, quantity: 1 }],
        fulfilmentType: "pickup",
        customerName: "Eval Customer",
        customerPhone: "03001234567",
        currency: "PKR",
      });
      let code: string | null = null;
      try {
        await createOrder({
          tenantId: TENANT,
          items: [{ itemId, quantity: 1 }],
          customerName: "Eval Customer",
          customerPhone: "03001234567",
          fulfilmentType: "pickup",
          idempotencyKey: `eval_min_${Date.now().toString(36)}`,
          channel: "web",
          currency: "PKR",
        });
      } catch (error: unknown) {
        code = (error as { code?: string }).code ?? "unknown";
      }
      return ok([
        check(
          "rejected with MIN_ORDER_NOT_MET",
          code === "MIN_ORDER_NOT_MET",
          String(code)
        ),
      ]);
    },
  },
  {
    id: "integration-007-cart-id-is-per-conversation",
    category: "order_state",
    description: "Each conversation gets its own cart",
    weight: "hard",
    kind: "integration",
    run: async () => {
      const a = await ensureCart({
        tenantId: TENANT,
        conversationId: "eval_conv_a",
        channel: "web",
        customerReference: "eval",
      });
      const b = await ensureCart({
        tenantId: TENANT,
        conversationId: "eval_conv_b",
        channel: "web",
        customerReference: "eval",
      });
      return ok([
        check("different carts", a.cartId !== b.cartId),
        check(
          "stable naming",
          a.cartId === cartIdForConversation("eval_conv_a")
        ),
      ]);
    },
  },
];


