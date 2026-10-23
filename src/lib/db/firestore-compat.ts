/**
 * Firestore-compatible data layer over Supabase (PostgREST).
 *
 * The application was written against the Firestore Admin SDK. Instead of
 * rewriting ~30 service modules, this module re-implements the exact subset
 * of the Firestore API the app uses, backed by Postgres tables with a
 * `data jsonb` document column. API response shapes stay identical.
 *
 * Filters and ordering use PostgREST virtual jsonb paths, writes are single
 * upserts (`resolution=merge-duplicates`), and there are per-field scalar
 * columns where sorting/filtering needs them.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ??
  "";

export class Increment {
  constructor(readonly amount: number) {}
}

export class Timestamp {
  seconds: number;
  nanoseconds: number;
  constructor(seconds: number, nanoseconds = 0) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  static fromDate(d: Date): Timestamp {
    const ms = d.getTime();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }
  static now(): Timestamp {
    return Timestamp.fromDate(new Date());
  }
  toDate(): Date {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1e6);
  }
  toMillis(): number {
    return this.toDate().getTime();
  }
  toString(): string {
    return this.toDate().toISOString();
  }
}

export class FirestoreError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "FirestoreError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

type RegistryEntry = {
  table: string;
  pk: string[];
  tenantScope: boolean;
  parent?: "conversation" | "customer";
  /** camelCase field -> scalar column (synced on write, used in filters/order) */
  fields?: Record<string, string>;
};

const BASE_FIELDS: Record<string, string> = {
  tenantId: "tenant_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

const COLLECTIONS: Record<string, RegistryEntry> = {
  tenants: {
    table: "tenants",
    pk: ["id"],
    tenantScope: false,
    fields: {
      // NOTE: tenants has no tenant_id column (the id itself is the key);
      // never map data.tenantId into a scalar column here.
      createdAt: "created_at",
      updatedAt: "updated_at",
      businessName: "business_name",
      status: "status",
      ownerUserId: "owner_user_id",
      country: "country",
      currency: "currency",
      timezone: "timezone",
    },
  },
  users: {
    table: "users_profiles",
    pk: ["id"],
    tenantScope: false,
    fields: {
      ...BASE_FIELDS,
      email: "email",
      displayName: "display_name",
      photoURL: "photo_url",
      role: "role",
    },
  },
  orderNumbers: {
    table: "order_numbers",
    pk: ["order_number"],
    tenantScope: false,
    fields: {
      createdAt: "created_at",
      tenantId: "tenant_id",
      orderId: "order_id",
      phoneHash: "phone_hash",
    },
  },
  rateLimits: { table: "rate_limits", pk: ["bucket_key"], tenantScope: false },
  metaPhoneNumbers: {
    table: "meta_phone_numbers",
    pk: ["id"],
    tenantScope: false,
  },
  whatsappSessions: {
    table: "whatsapp_sessions",
    pk: ["id"],
    tenantScope: false,
  },
  orders: {
    table: "orders",
    pk: ["id"],
    tenantScope: true,
    fields: {
      ...BASE_FIELDS,
      orderNumber: "order_number",
      channel: "channel",
      status: "status",
      paymentStatus: "payment_status",
      currency: "currency",
      subtotalMinor: "subtotal_minor",
      discountMinor: "discount_minor",
      deliveryFeeMinor: "delivery_fee_minor",
      totalMinor: "total_minor",
      appliedOffer: "applied_offer",
    },
  },
  carts: {
    table: "carts",
    pk: ["id"],
    tenantScope: true,
    fields: {
      ...BASE_FIELDS,
      channel: "channel",
      status: "status",
      conversationId: "conversation_id",
      cartRevision: "cart_revision",
      items: "items",
      currentQuote: "current_quote",
      fulfilment: "fulfilment",
      customer: "customer",
      lastOrderNumber: "last_order_number",
    },
  },
  conversations: {
    table: "conversations",
    pk: ["id"],
    tenantScope: true,
    fields: {
      ...BASE_FIELDS,
      channel: "channel",
      status: "status",
      language: "language",
    },
  },
  messages: {
    table: "conversation_messages",
    pk: ["id"],
    tenantScope: true,
    parent: "conversation",
    fields: {
      createdAt: "created_at",
      updatedAt: "updated_at",
      tenantId: "tenant_id",
      conversationId: "conversation_id",
      role: "role",
      text: "text",
    },
  },
  turnMetrics: {
    table: "turn_metrics",
    pk: ["id"],
    tenantScope: true,
    parent: "conversation",
  },
  customers: {
    table: "customers",
    pk: ["id"],
    tenantScope: true,
    fields: {
      ...BASE_FIELDS,
      phoneHash: "phone_hash",
      phone: "phone",
      name: "name",
    },
  },
  memories: {
    table: "customer_memories",
    pk: ["id"],
    tenantScope: true,
    parent: "customer",
  },
  customerIdentities: {
    table: "customer_identities",
    pk: ["id"],
    tenantScope: true,
  },
  memoryJobs: {
    table: "memory_jobs",
    pk: ["id"],
    tenantScope: true,
    fields: { ...BASE_FIELDS, status: "status" },
  },
  reminders: {
    table: "memory_jobs",
    pk: ["id"],
    tenantScope: true,
    fields: { ...BASE_FIELDS, status: "status" },
  },
  menuCategories: {
    table: "menu_categories",
    pk: ["id"],
    tenantScope: true,
    fields: {
      ...BASE_FIELDS,
      name: "name",
      sortOrder: "sort_order",
    },
  },
  menuItems: {
    table: "menu_items",
    pk: ["id"],
    tenantScope: true,
    fields: {
      ...BASE_FIELDS,
      categoryId: "category_id",
      name: "name",
      priceMinor: "price_minor",
      enabled: "enabled",
    },
  },
  offers: {
    table: "offers",
    pk: ["id"],
    tenantScope: true,
    fields: { ...BASE_FIELDS, name: "name", enabled: "enabled" },
  },
  knowledgeBase: {
    table: "knowledge_base",
    pk: ["id"],
    tenantScope: true,
    fields: { ...BASE_FIELDS, title: "title", status: "status" },
  },
  bookings: {
    table: "bookings",
    pk: ["id"],
    tenantScope: true,
    fields: {
      ...BASE_FIELDS,
      customerName: "customer_name",
      phone: "phone",
      bookingDate: "booking_date",
      status: "status",
    },
  },
  members: {
    table: "tenant_members",
    pk: ["user_id"],
    tenantScope: true,
    fields: {
      ...BASE_FIELDS,
      role: "role",
      status: "status",
      invitedBy: "invited_by",
    },
  },
  profile: {
    table: "tenant_profiles",
    pk: ["tenant_id"],
    tenantScope: true,
    fields: {
      ...BASE_FIELDS,
      businessName: "business_name",
      country: "country",
      timezone: "timezone",
      currency: "currency",
    },
  },
  settings: {
    table: "tenant_settings",
    pk: ["key", "tenant_id"],
    tenantScope: true,
  },
  whatsappInbox: {
    table: "whatsapp_inbox",
    pk: ["id"],
    tenantScope: true,
  },
  whatsappEventLog: {
    table: "whatsapp_event_log",
    pk: ["id"],
    tenantScope: true,
  },
  whatsappSettings: {
    table: "whatsapp_settings",
    pk: ["tenant_id"],
    tenantScope: true,
  },
  qrWebhookTokens: {
    table: "qr_webhook_tokens",
    pk: ["token"],
    tenantScope: true,
    fields: { ...BASE_FIELDS, expiresAt: "expires_at" },
  },
  widgetConfigs: {
    table: "widget_configs",
    pk: ["tenant_id"],
    tenantScope: true,
  },
  widgetEvents: {
    table: "widget_events",
    pk: ["id"],
    tenantScope: true,
    fields: { createdAt: "created_at", tenantId: "tenant_id" },
  },
  apiKeys: {
    table: "api_keys",
    pk: ["id"],
    tenantScope: true,
    fields: {
      ...BASE_FIELDS,
      keyHash: "key_hash",
      label: "label",
    },
  },
};

type Scope =
  | { kind: "root"; name: string }
  | { kind: "tenant"; name: string; tenantId: string }
  | { kind: "conversation"; name: string; tenantId: string; parentId: string }
  | { kind: "customer"; name: string; tenantId: string; parentId: string };

function segmentsOf(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

function assertRegistry(name: string): RegistryEntry {
  const entry = COLLECTIONS[name];
  if (!entry) {
    throw new FirestoreError("not-found", `No collection mapping for "${name}"`);
  }
  return entry;
}

function resolveRoot(name: string): Scope {
  assertRegistry(name);
  return { kind: "root", name };
}

function resolveTenant(tenantId: string, name: string, segments: string[]): Scope {
  assertRegistry(name);
  if (segments.length === 3) {
    return { kind: "tenant", name, tenantId };
  }
  if (segments.length === 5 && COLLECTIONS[segments[4]]) {
    const parentTable = COLLECTIONS[name].table;
    if (parentTable === "conversations") {
      return {
        kind: "conversation",
        name: segments[4],
        tenantId,
        parentId: segments[3],
      };
    }
    if (parentTable === "customers") {
      return { kind: "customer", name: segments[4], tenantId, parentId: segments[3] };
    }
  }
  throw new FirestoreError("not-found", "Unsupported collection path depth");
}

// ---------------------------------------------------------------------------
// PostgREST primitives
// ---------------------------------------------------------------------------

async function pgRequest(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  table: string,
  options: { query?: string[]; body?: unknown; prefer?: string[] }
): Promise<Record<string, unknown>[]> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const q of options.query ?? []) {
    const i = q.indexOf("=");
    if (i > 0) url.searchParams.set(q.slice(0, i), q.slice(i + 1));
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
  };
  if (options.prefer?.length) headers.Prefer = options.prefer.join(",");
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(url.toString(), {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    let code = `HTTP_${res.status}`;
    let message = text;
    try {
      const parsed = JSON.parse(text);
      code = parsed.code ?? code;
      message = parsed.message ?? text;
    } catch {}
    throw new FirestoreError(code, `${method} ${table}: ${message}`);
  }
  if (method === "GET") {
    const text = await res.text();
    if (!text) return [];
    return JSON.parse(text) as Record<string, unknown>[];
  }
  return [];
}

/** Firestore Date/Timestamp instances -> JSON-safe storage values */
function serialize(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(serialize);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    out[key] = serialize((value as Record<string, unknown>)[key]);
  }
  return out;
}

function isoOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** camelCase field -> PostgREST expression (scalar column or jsonb virtual) */
function fieldExpression(scope: Scope, camelField: string): string {
  const fields = registryEntry(scope).fields ?? {};
  if (fields[camelField]) return fields[camelField];
  return `data->>${camelField}`;
}

function registryEntry(scope: Scope): RegistryEntry {
  return COLLECTIONS[scope.name] ?? assertRegistry(scope.name);
}

const OPERATION_MAP: Record<string, string> = {
  "==": "eq",
  "!=": "neq",
  ">": "gt",
  ">=": "gte",
  "<": "lt",
  "<=": "lte",
  in: "in",
  "not-in": "notin",
  "array-contains": "contains",
};

function eqValue(value: unknown): string {
  if (value === null) return "is.null";
  return String(value);
}

function scalarColumns(scope: Scope, data: Record<string, unknown>): Record<string, unknown> {
  const fields = registryEntry(scope).fields ?? {};
  const out: Record<string, unknown> = {};
  for (const [camelField, column] of Object.entries(fields)) {
    const value = data[camelField];
    if (value === undefined) continue;
    if (
      column === "created_at" ||
      column === "updated_at" ||
      column === "booking_date" ||
      column === "expires_at"
    ) {
      out[column] = isoOf(value) ?? new Date().toISOString();
      continue;
    }
    out[column] = value === null ? null : serialize(value);
  }
  return out;
}

function buildRow(
  scope: Scope,
  id: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const entry = registryEntry(scope);
  const row: Record<string, unknown> = {
    ...scalarColumns(scope, data),
    data,
  };

  if (entry.pk[0] === "id") {
    row.id = id;
  } else if (entry.pk[0] === "order_number") {
    row.order_number = id;
  } else if (entry.pk[0] === "token") {
    row.token = id;
  } else if (entry.pk[0] === "bucket_key") {
    row.bucket_key = id;
  } else if (entry.pk[0] === "key") {
    row.key = id;
  } else if (entry.pk[0] === "user_id") {
    row.user_id = id;
  } else if (entry.pk[0] === "tenant_id") {
    row.tenant_id = scope.kind === "root" ? id : scope.tenantId;
  }

  if (entry.tenantScope && scope.kind !== "root") {
    row.tenant_id = scope.tenantId;
  }
  if (entry.parent === "conversation" && scope.kind === "conversation") {
    row.conversation_id = scope.parentId;
  }
  if (entry.parent === "customer" && scope.kind === "customer") {
    row.customer_id = scope.parentId;
  }
  for (const key of Object.keys(row)) {
    if (row[key] === undefined) delete row[key];
  }
  return row;
}

// ---------------------------------------------------------------------------
// snapshot types
// ---------------------------------------------------------------------------

export class DocumentSnapshot<T = Record<string, unknown>> {
  constructor(
    readonly id: string,
    private readonly dataValue: Record<string, unknown> | null,
    readonly ref: DocRef
  ) {}
  get exists(): boolean {
    return this.dataValue !== null;
  }
  /** matches Firestore admin typing: DocumentData == any payload */
  // eslint-disable-next-line
  data(): any {
    return this.dataValue === null ? {} : this.dataValue;
  }
}

export class QuerySnapshot<T = Record<string, unknown>> {
  readonly empty: boolean;
  readonly size: number;
  constructor(readonly docs: Array<DocumentSnapshot<T>>) {
    this.empty = docs.length === 0;
    this.size = docs.length;
  }
}

function fullScopePath(scope: Scope): string {
  switch (scope.kind) {
    case "root":
      return scope.name;
    case "tenant":
      return `tenants/${scope.tenantId}/${scope.name}`;
    case "conversation":
      return `tenants/${scope.tenantId}/conversations/${scope.parentId}/${scope.name}`;
    case "customer":
      return `tenants/${scope.tenantId}/customers/${scope.parentId}/${scope.name}`;
  }
}

export class DocRef {
  constructor(
    readonly scope: Scope,
    readonly id: string
  ) {}

  private get table(): string {
    return registryEntry(this.scope).table;
  }

  collection(name: string): CollectionImpl {
    if (this.scope.kind === "root") {
      // tenants/{id}/{sub} doc-level children
      const tenantId = this.scope.name === "tenants" ? this.id : this.id;
      return new CollectionImpl(
        resolveTenant(tenantId, name, ["tenants", tenantId, name])
      );
    }
    if (this.scope.kind === "tenant") {
      if (registryEntry(this.scope).table === "conversations") {
        return new CollectionImpl({
          kind: "conversation",
          name,
          tenantId: this.scope.tenantId,
          parentId: this.id,
        });
      }
      if (registryEntry(this.scope).table === "customers") {
        return new CollectionImpl({
          kind: "customer",
          name,
          tenantId: this.scope.tenantId,
          parentId: this.id,
        });
      }
    }
    throw new FirestoreError(
      "not-found",
      `No child collections under ${fullScopePath(this.scope)}`
    );
  }

  parent(): CollectionImpl | null {
    if (this.scope.kind === "conversation") {
      return new CollectionImpl({
        kind: "tenant",
        name: "conversations",
        tenantId: this.scope.tenantId,
      });
    }
    if (this.scope.kind === "customer") {
      return new CollectionImpl({
        kind: "tenant",
        name: "customers",
        tenantId: this.scope.tenantId,
      });
    }
    if (this.scope.kind === "tenant") {
      return new CollectionImpl(resolveRoot("tenants"));
    }
    return null;
  }

  async get(): Promise<DocumentSnapshot> {
    const entry = registryEntry(this.scope);
    const rows = await pgRequest("GET", this.table, {
      query: [`select=${entry.pk.join(",")},data`, ...this.rowFilters()],
    });
    const row = rows[0];
    return row
      ? new DocumentSnapshot(
          this.id,
          (row.data as Record<string, unknown>) ?? {},
          this
        )
      : new DocumentSnapshot(this.id, null, this);
  }
  async set(
    data: object,
    options?: { merge?: boolean }
  ): Promise<void> {
    const entry = registryEntry(this.scope);
    const patch = data as Record<string, unknown>;
    let finalData: Record<string, unknown>;
    if (options?.merge) {
      const current = await this.get();
      const base = current.exists
        ? ((current.data() as Record<string, unknown>) ?? {})
        : {};
      const hasIncrement = Object.values(patch).some((v) => v instanceof Increment);
      finalData = hasIncrement
        ? mergeDocsResolvingIncrement(base, patch)
        : mergeDocs(base, patch);
    } else {
      finalData = mergeDocs({}, patch);
    }
    finalData = serialize(finalData) as Record<string, unknown>;
    const row = buildRow(this.scope, this.id, finalData);
    await pgRequest("POST", entry.table, {
      body: [row],
      query: [`on_conflict=${entry.pk.join(",")}`],
      prefer: ["resolution=merge-duplicates", "return=minimal"],
    });
  }

  async update(data: object): Promise<void> {
    const current = await this.get();
    if (!current.exists) {
      throw new FirestoreError("not-found", `No document to update: ${this.id}`);
    }
    const merged = mergeDocsResolvingIncrement(
      (current.data() as Record<string, unknown>) ?? {},
      data as Record<string, unknown>
    );
    await this.set(merged, { merge: false });
  }

  async delete(): Promise<void> {
    await pgRequest("DELETE", this.table, { query: this.rowFilters() });
  }

  private rowFilters(): string[] {
    const entry = registryEntry(this.scope);
    return entry.pk.map((column) => {
      let value: unknown = this.id;
      if (column === "tenant_id") {
        value = this.scope.kind === "root" ? this.id : this.scope.tenantId;
      } else if (column === "conversation_id") {
        value = this.scope.kind === "conversation" ? this.scope.parentId : "";
      } else if (column === "customer_id") {
        value = this.scope.kind === "customer" ? this.scope.parentId : "";
      }
      return `${column}=eq.${eqValue(value)}`;
    });
  }
}

function mergeDocs(
  base: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = JSON.parse(JSON.stringify(serialize(base)));
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (key.includes(".")) {
      applyDottedPath(out, key.split("."), value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function mergeDocsResolvingIncrement(
  base: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const out = mergeDocs(base, {});
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    const amount = value instanceof Increment ? value.amount : null;
    if (key.includes(".")) {
      const parts = key.split(".");
      const last = parts.pop()!;
      let cursor = out;
      for (const part of parts) {
        if (
          typeof cursor[part] !== "object" ||
          cursor[part] === null ||
          Array.isArray(cursor[part])
        ) {
          cursor[part] = {};
        }
        cursor = cursor[part] as Record<string, unknown>;
      }
      cursor[last] =
        amount !== null ? (Number(cursor[last] ?? 0) || 0) + amount : value;
    } else {
      out[key] =
        amount !== null ? (Number(out[key] ?? 0) || 0) + amount : value;
    }
  }
  return out;
}

function applyDottedPath(
  target: Record<string, unknown>,
  parts: string[],
  value: unknown
): void {
  const last = parts.pop()!;
  let cursor = target;
  for (const part of parts) {
    if (
      typeof cursor[part] !== "object" ||
      cursor[part] === null ||
      Array.isArray(cursor[part])
    ) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[last] = value;
}

function applyQuery(
  scope: Scope,
  wheres: WhereCondition[],
  orders: OrderCondition[],
  limitValue: number | undefined
): string[] {
  const query: string[] = [];

  if (scope.kind !== "root") {
    query.push(`tenant_id=eq.${scope.tenantId}`);
  }
  if (scope.kind === "conversation") {
    query.push(`conversation_id=eq.${scope.parentId}`);
  }
  if (scope.kind === "customer") {
    query.push(`customer_id=eq.${scope.parentId}`);
  }

  for (const w of wheres) {
    const expression = fieldExpression(scope, w.field);
    if (w.value === null) {
      query.push(`${expression}=is.null`);
      continue;
    }
    const op = OPERATION_MAP[w.op] ?? "eq";
    let value = eqValue(w.value);
    if (w.op === "in" || w.op === "not-in") {
      const list = (w.value as unknown[]).map(eqValue).join(",");
      value = `(${list})`;
    }
    query.push(`${expression}=${op}.${value}`);
  }

  if (orders.length > 0) {
    query.push(
      `order=${orders
        .map((o) => `${fieldExpression(scope, o.field)}.${o.direction}`)
        .join(",")}`
    );
  }

  if (limitValue) query.push(`limit=${limitValue}`);
  query.push(`select=${registryEntry(scope).pk.join(",")},data`);
  return query;
}

export interface WhereCondition {
  field: string;
  op: string;
  value: unknown;
}

interface OrderCondition {
  field: string;
  direction: "asc" | "desc";
}

export class Query {
  constructor(
    protected readonly scope: Scope,
    protected readonly wheres: WhereCondition[] = [],
    protected readonly orders: OrderCondition[] = [],
    protected readonly limitValue?: number
  ) {}

  where(field: string, op: string, value: unknown): Query {
    return new Query(this.scope, [...this.wheres, { field, op, value }], this.orders, this.limitValue);
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): Query {
    return new Query(this.scope, this.wheres, [...this.orders, { field, direction }], this.limitValue);
  }

  limit(count: number): Query {
    return new Query(this.scope, this.wheres, this.orders, count);
  }

  async get(): Promise<QuerySnapshot> {
    const table = registryEntry(this.scope).table;
    const rows = await pgRequest("GET", table, {
      query: applyQuery(this.scope, this.wheres, this.orders, this.limitValue),
    });
    return new QuerySnapshot(rows.map((row) => this.toSnapshot(row)));
  }

  protected toSnapshot(row: Record<string, unknown>): DocumentSnapshot {
    const entry = registryEntry(this.scope);
    const docId = String(row[entry.pk[0]] ?? row.id ?? "");
    return new DocumentSnapshot(
      docId,
      (row.data as Record<string, unknown>) ?? {},
      new DocRef(this.scope, docId)
    );
  }
}

export class CollectionImpl {
  constructor(readonly scope: Scope) {}

  get id(): string {
    return this.scope.name;
  }

  parent(): DocRef | null {
    if (this.scope.kind === "conversation") {
      return new DocRef(
        { kind: "tenant", name: "conversations", tenantId: this.scope.tenantId },
        this.scope.parentId
      );
    }
    if (this.scope.kind === "customer") {
      return new DocRef(
        { kind: "tenant", name: "customers", tenantId: this.scope.tenantId },
        this.scope.parentId
      );
    }
    if (this.scope.kind === "tenant") {
      return new DocRef(resolveRoot("tenants"), this.scope.tenantId);
    }
    return null;
  }

  doc(id?: string): DocRef {
    return new DocRef(this.scope, id ?? autoId());
  }

  add(data: object): Promise<DocRef> {
    const ref = this.doc();
    return ref.set(data).then(() => ref);
  }

  where(field: string, op: string, value: unknown): Query {
    return new Query(this.scope).where(field, op, value);
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): Query {
    return new Query(this.scope).orderBy(field, direction);
  }

  limit(count: number): Query {
    return new Query(this.scope).limit(count);
  }

  async get(): Promise<QuerySnapshot> {
    return new Query(this.scope).limit(Number.MAX_SAFE_INTEGER).get();
  }

  async listCollections(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

function autoId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** cross-tenant group query (members lookup); filters land on data jsonb */
export function collectionGroup(name: string): Query {
  assertRegistry(name);
  return new Query(resolveRoot(name));
}

/** db.collection("tenants/<id>/<sub>") style path entry */
export function collectionFacade(path: string): CollectionImpl {
  const parts = segmentsOf(path);
  if (parts.length === 1) return new CollectionImpl(resolveRoot(parts[0]));
  if (parts[0] === "tenants" && parts.length >= 3) {
    return new CollectionImpl(resolveTenant(parts[1], parts[2], parts));
  }
  throw new FirestoreError("not-found", `Unsupported collection path: ${path}`);
}

/** db.doc("tenants/<id>/<sub>/<docId>") style leaf entry */
export function docFacade(path: string): DocRef {
  const parts = segmentsOf(path);
  if (parts.length === 2) {
    const scope = resolveRoot(parts[0]);
    return new DocRef(scope, parts[1]);
  }
  if (parts[0] === "tenants" && parts.length === 4) {
    const tenantId = parts[1];
    return new DocRef(resolveTenant(tenantId, parts[2], parts), parts[3]);
  }
  if (parts[0] === "tenants" && parts.length === 6) {
    // tenants/{t}/{parent}/{pid}/{sub}/{docId}
    const scope = resolveTenant(parts[1], parts[2], parts.slice(0, 5));
    return new DocRef(scope, parts[5]);
  }
  throw new FirestoreError("not-found", `Unsupported doc path: ${path}`);
}

/** db.collectionGroup("members") */
export const collectionGroupFacade = collectionGroup;

// ---------------------------------------------------------------------------
// atomic rpc helpers (replace Firestore runTransaction flows)
// ---------------------------------------------------------------------------

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    let code = `HTTP_${res.status}`;
    let message = text;
    try {
      const parsed = JSON.parse(text);
      code = parsed.code ?? code;
      message = parsed.message ?? text;
    } catch {}
    throw new FirestoreError(code, `rpc ${name}: ${message}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * Resolve an image asset id to the menu item row that references it.
 * PostgREST cannot filter nested jsonb arrays ("imageReferences[].assetId")
 * from query params, so the lookup goes through a security-definer RPC.
 */
export async function findMenuItemByAsset(
  assetId: string
): Promise<{ itemId: string; tenantId: string } | null> {
  const rows = await rpc<
    Array<{ out_item_id: string; out_tenant_id: string }>
  >("find_menu_item_by_asset", { p_asset_id: assetId });
  const first = Array.isArray(rows) ? rows[0] : rows;
  if (!first || !first.out_item_id || !first.out_tenant_id) return null;
  return { itemId: first.out_item_id, tenantId: first.out_tenant_id };
}

/** reserve_order_number(p_tenant, p_currency) -> "TC-YYMMDD-8HEX" */
export async function reserveOrderNumberViaRpc(
  tenantId: string,
  currency: string
): Promise<string> {
  return rpc<string>("reserve_order_number", {
    p_tenant: tenantId,
    p_currency: currency,
  });
}

/**
 * Idempotent insert-if-absent for document() with an explicit id — the
 * Postgres analogue of Firestore's runTransaction set-once behaviour.
 * Returns true when this call created the row.
 */
export async function insertIdempotent(
  entry: unknown,
  id: string,
  data: object
): Promise<boolean> {
  const collectionRef = entry as CollectionImpl;
  const row = buildRow(collectionRef.scope, id, serialize(data) as Record<string, unknown>);
  const table = registryEntry(collectionRef.scope).table;
  const rows = await pgRequest("POST", table, {
    body: [row],
    query: [
      `on_conflict=${registryEntry(collectionRef.scope).pk.join(",")}`
    ],
    prefer: ["resolution=ignore-duplicates", "return=representation"],
  });
  return rows.length > 0;
}
