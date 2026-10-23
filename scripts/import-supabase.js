/**
 * Imports the Firestore export (tmp-migration/firestore.json) into Supabase.
 *
 * Row layout mirrors the Firestore-compat shim (src/lib/db/firestore-compat.ts)
 * : all document fields into `data jsonb` + scalar sync columns for the
 * fields used in filters/order. Idempotent: upsert via merge-duplicates.
 *
 * Run: node scripts/import-supabase.js
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, "..");

const envFile = readFileSync(join(root, ".env.local"), "utf8");
const env = {};
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) {
  throw new Error("Missing Supabase env credentials in .env.local");
}

const EXPORT_PATH = process.argv[2] ?? join(root, "tmp-migration", "firestore.json");
const exportData = JSON.parse(readFileSync(EXPORT_PATH, "utf8"));

// ---------------------------------------------------------------------------

async function request(method, table, { query = [], body, prefer } = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const q of query) {
    const i = q.indexOf("=");
    if (i > 0) url.searchParams.set(q.slice(0, i), q.slice(i + 1));
  }
  const headers = {
    Authorization: `Bearer ${KEY}`,
    apikey: KEY,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer?.length) headers.Prefer = prefer.join(",");

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${table}: HTTP ${res.status}: ${text}`);
  }
  if (method === "GET") {
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  }
  return [];
}

const TABLES = {
  tenants: { pk: "id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  users: { pk: "id", table: "users_profiles", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  orderNumbers: {
    pk: "order_number",
    table: "order_numbers",
    fields: { createdAt: "created_at", tenantId: "tenant_id", orderId: "order_id", phoneHash: "phone_hash" },
  },
  qrWebhookTokens: {
    pk: "token",
    table: "qr_webhook_tokens",
    fields: { createdAt: "created_at", tenantId: "tenant_id" },
  },
  rateLimits: { pk: "bucket_key", table: "rate_limits", fields: {} },
  whatsappEventLog: { pk: "id", table: "whatsapp_event_log", fields: { createdAt: "created_at" } },
  widgetConfigs: { pk: "tenant_id", table: "widget_configs", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  metaPhoneNumbers: { pk: "id", table: "meta_phone_numbers", fields: { createdAt: "created_at" } },
  whatsappSessions: { pk: "id", table: "whatsapp_sessions", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  members: { pk: "user_id", table: "tenant_members", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  profile: { pk: "tenant_id", table: "tenant_profiles", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  settings: { pk: "key", table: "tenant_settings", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  orders: { pk: "id", table: "orders", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  carts: { pk: "id", table: "carts", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  conversations: { pk: "id", table: "conversations", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  customers: { pk: "id", table: "customers", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  customerIdentities: { pk: "id", table: "customer_identities", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  memories: { pk: "id", table: "customer_memories", extra: "tenant_id", extra2: "customer_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  memoryJobs: { pk: "id", table: "memory_jobs", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  menuCategories: { pk: "id", table: "menu_categories", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  menuItems: { pk: "id", table: "menu_items", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  offers: { pk: "id", table: "offers", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  knowledgeBase: { pk: "id", table: "knowledge_base", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  bookings: { pk: "id", table: "bookings", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  whatsappInbox: { pk: "id", table: "whatsapp_inbox", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
  widgetEvents: { pk: "id", table: "widget_events", extra: "tenant_id", fields: { createdAt: "created_at" } },
  apiKeys: { pk: "id", table: "api_keys", extra: "tenant_id", fields: { createdAt: "created_at", updatedAt: "updated_at" } },
};

const BATCH = 200;

/** upsert rows in batches; each row is {table, data} */
async function upsertBatches(rows, tableSpec, table, onConflict) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await request("POST", table, {
      body: chunk,
      query: [`on_conflict=${onConflict}`],
      prefer: ["resolution=merge-duplicates", "return=minimal"],
    });
  }
  return rows.length;
}

function norm(value) {
  const DATE_RE = null;
  const DATE_KEYS = new Set([
    "createdAt", "updatedAt", "lastMessageAt", "lastSeenAt", "expiresAt",
    "processedAt", "receivedAt", "sentAt", "effectiveAt", "reviewAt",
    "lastValidatedAt", "lastOrderAt", "windowStart", "signedUpAt",
  ]);
  const TIMESTAMPS = [
    "createdAt", "updatedAt", "lastMessageAt", "lastSeenAt", "expiresAt",
    "processedAt", "receivedAt", "sentAt", "effectiveAt", "reviewAt",
    "lastValidatedAt", "lastOrderAt",
  ];
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(norm);
  const out = {};
  for (const key of Object.keys(value)) {
    const inner = value[key];
    if (TIMESTAMPS.includes(key)) {
      out[key] = toIso(inner);
      continue;
    }
    out[key] = typeof inner === "object" && inner !== null ? norm(inner) : inner;
  }
  return out;
}

function toIso(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    // epoch millis or epoch seconds
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function docRows(records, spec, tenantId, extraIds = {}) {
  return records
    .filter((doc) => doc && doc._id)
    .map((doc) => {
      const data = {};
      for (const [key, value] of Object.entries(doc)) {
        if (key.startsWith("_")) continue;
        data[key] = norm(value);
      }
      const row = {
        ...scalarPayload(spec, data),
        data,
      };
      row[spec.pk] = spec.pk === "tenant_id" ? tenantId : doc._id;
      if (spec.extra) row[spec.extra] = tenantId;
      if (spec.extra2) row[spec.extra2] = extraIds.customerId;
      return row;
    });
}

function scalarPayload(spec, data) {
  const out = {};
  for (const [camel, column] of Object.entries(spec.fields ?? {})) {
    const value = data[camel];
    if (value === undefined || value === null) continue;
    out[column] = toIso(value);
  }
  // conversations/orders/status etc as columns where relevant
  const EXTRA_SCALARS = {
    orders: {
      status: "status",
      channel: "channel",
      paymentStatus: "payment_status",
      currency: "currency",
      subtotalMinor: "subtotal_minor",
      discountMinor: "discount_minor",
      deliveryFeeMinor: "delivery_fee_minor",
      totalMinor: "total_minor",
      appliedOffer: "applied_offer",
      orderNumber: "order_number",
    },
    carts: {
      channel: "channel",
      status: "status",
      conversationId: "conversation_id",
      cartRevision: "cart_revision",
    },
    conversations: { channel: "channel", status: "status", language: "language" },
    customers: { phoneHash: "phone_hash", phone: "phone", name: "name" },
    menu_items: {
      categoryId: "category_id",
      name: "name",
      priceMinor: "price_minor",
      enabled: "enabled",
    },
    menu_categories: { name: "name", sortOrder: "sort_order" },
    offers: { name: "name", enabled: "enabled" },
    bookings: {
      customerName: "customer_name",
      phone: "phone",
      bookingDate: "booking_date",
      status: "status",
    },
    memory_jobs: { status: "status" },
    knowledge_base: { title: "title" },
  };
  for (const [camel, column] of Object.entries(EXTRA_SCALARS[tableOf(spec)] ?? {})) {
    const value = data[camel];
    if (value === undefined) continue;
    out[column] = value === null ? null : value;
  }
  return out;
}

function tableOf(spec) {
  return spec.table ?? spec.name;
}

const summary = {};

function bump(key, count) {
  summary[key] = (summary[key] ?? 0) + count;
}

async function importRoot() {
  // tenants
  for (const tenant of exportData.tenants ?? []) {
    const tenantId = tenant._id;
    const data = {};
    for (const [key, value] of Object.entries(tenant)) {
      if (key === "_id" || key === "subcollections") continue;
      data[key] = Array.isArray(value) ? null : norm(value);
    }
    const row = { ...scalarPayload(TABLES.tenants, data), data };
    row.id = tenantId;
    row.business_name = data.businessName ?? data.name ?? "(imported tenant)";
    row.status = data.status ?? "pending_setup";
    await request("POST", "tenants", {
      body: [row],
      query: ["on_conflict=id"],
      prefer: ["resolution=merge-duplicates", "return=minimal"],
    });
    bump("tenants", 1);

    // tenant subcollections (dependency order: referenced tables first)
    const ORDER = [
      "profile", "settings", "members", "menuCategories", "menuItems", "offers",
      "orders", "conversations", "carts", "customers", "customerIdentities",
      "memories", "memoryJobs", "knowledgeBase", "bookings", "whatsappInbox",
      "widgetEvents", "apiKeys",
    ];
    const subsRaw = tenant.subcollections ?? {};
    const subs = ORDER.map((name) => [name, subsRaw[name] ?? null]).filter(([, v]) => v);
    for (const [name, recordsRaw] of subs) {
      const spec = TABLES[name];
      if (!spec || name === "widgetConfigs") continue;

      if (name === "members") {
        const rows = recordsRaw.map((doc) => ({
          tenant_id: tenantId,
          user_id: doc.userId ?? doc.membershipId ?? doc._id,
          role: doc.role ?? "owner",
          status: doc.status ?? "active",
          created_at: doc.createdAt ?? new Date().toISOString(),
          data: norm(doc),
        }));
        bump(name, await upsertValue(rows, TABLES.members.table, "tenant_id,user_id"));
        continue;
      }
      if (name === "profile") {
        const rows = recordsRaw.map((doc) => ({
          ...scalarPayload(spec, norm(doc)),
          tenant_id: tenantId,
          data: norm(stripId(doc)),
        }));
        bump(name, await upsertValue(rows, "tenant_profiles", "tenant_id"));
        continue;
      }
      if (name === "settings") {
        const rows = recordsRaw.map((doc) => ({
          key: doc._id,
          tenant_id: tenantId,
          data: norm(stripId(doc)),
        }));
        bump(name, await upsertValue(rows, "tenant_settings", "tenant_id,key"));
        continue;
      }
      if (name === "orders") {
        const rows = docRows(recordsRaw, spec, tenantId).map((row) => {
          row.order_number = row.data.orderNumber ?? "";
          return row;
        });
        // orderNumbers table sync via orderNumbers root already; row-level:
        // rows have heterogeneous scalar mixes -> upsert one by one
        for (const row of rows) {
          await request("POST", "orders", {
            body: [row],
            query: ["on_conflict=id"],
            prefer: ["resolution=merge-duplicates", "return=minimal"],
          });
        }
        bump(name, rows.length);
        continue;
      }
      if (name === "menuItems") {
        const rows = docRows(recordsRaw, spec, tenantId).map((row) => {
          row.category_id = row.data.categoryId ?? null;
          return row;
        });
        bump(name, await upsertValue(rows, "menu_items", "id"));
        continue;
      }
      if (name === "widgetEvents") {
        const rows = docRows(recordsRaw, spec, tenantId);
        bump(name, await upsertValue(rows, "widget_events", "id"));
        continue;
      }
      if (spec.extra2 === "customer_id") {
        // nested memories
        const rows = [];
        for (const customer of subs.customers ?? []) {
          for (const mem of customer.memories ?? []) {
            rows.push({
              id: mem._id,
              tenant_id: tenantId,
              customer_id: customer._id,
              created_at: mem.createdAt ?? new Date().toISOString(),
              data: norm(stripId(mem)),
            });
          }
        }
        if (rows.length) bump(name, await upsertValue(rows, "customer_memories", "id"));
        continue;
      }
      const rows = docRows(recordsRaw, spec, tenantId);
      if (name === "carts") {
        const convIds = new Set((subsRaw.conversations ?? []).map((c) => c._id));
        for (const row of rows) {
          if (row.conversation_id && !convIds.has(row.conversation_id)) row.conversation_id = null;
        }
      }
      bump(name, await upsertValue(rows, tableOf(spec), spec.pk));
    }
  }

  for (const key of [
    "users", "orderNumbers", "qrWebhookTokens", "rateLimits",
    "whatsappEventLog", "widgetConfigs", "metaPhoneNumbers", "whatsappSessions",
  ]) {
    const spec = TABLES[key];
    const records = exportData[key] ?? [];
    const table = tableOf(spec);
    const rows = records.map((doc) => {
      const data = {};
      for (const [k, v] of Object.entries(doc)) {
        if (k.startsWith("_")) continue;
        data[k] = norm(v);
      }
      const row = { ...scalarPayload(spec, data), data };
      row[spec.pk] = doc._id;
      return row;
    });
    // heterogeneous scalar sets -> upsert one by one
    let done = 0;
    for (const row of rows) {
      await request("POST", table, {
        body: [row],
        query: [`on_conflict=${spec.pk}`],
        prefer: ["resolution=merge-duplicates", "return=minimal"],
      });
      done += 1;
    }
    bump(key, done);
  }
}

function upsertValue(rows, table, onConflict) {
  return request("POST", table, {
    body: rows,
    query: [`on_conflict=${onConflict}`],
    prefer: ["resolution=merge-duplicates", "return=minimal"],
  }).catch((err) => {
    throw err;
  }).then(() => rows.length);
}

// strip _id out of a doc before storing
function stripId(doc) {
  const clone = { ...doc };
  delete clone._id;
  return clone;
}

async function main() {
  console.log("Importing Firestore export into Supabase...");
  try {
    await importRoot();
  } catch (error) {
    console.error("FAILED:", error.message);
    console.error("Partial summary:", summary);
    process.exitCode = 1;
    return;
  }
  console.log("Import summary:", summary);
}

await main();
