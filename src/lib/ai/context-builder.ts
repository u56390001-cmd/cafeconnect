import { tenantCollection, tenantDoc } from "@/lib/tenancy/resolver";
import { Timestamp } from "firebase-admin/firestore";

export interface MenuContext {
  categories: Array<{
    categoryId: string;
    name: string;
  }>;
  items: Array<{
    itemId: string;
    categoryName: string;
    name: string;
    description: string;
    priceLabel: string;
    availability: string;
  }>;
}

export interface OfferContext {
  offerId: string;
  name: string;
  description: string;
  valueLabel: string;
  minOrderLabel: string | null;
}

export interface KnowledgeContext {
  title: string;
  category: string;
  content: string;
}

export interface BusinessContext {
  name: string;
  types: string[];
  phone: string | null;
  address: string | null;
  hours: string | null;
  deliveryFeeLabel: string | null;
  minimumOrderLabel: string | null;
  deliveryArea: string | null;
  pickupAvailable: boolean;
  paymentMethods: string | null;
  orderInstructions: string | null;
  currentDate: string;
}

export interface TenantAiContext {
  businessName: string;
  businessTypes: string[];
  currency: string;
  business: BusinessContext;
  aiSettings: {
    greeting: string | null;
    language: string;
    tone: string | null;
    handoffNote: string | null;
  };
  menu: MenuContext;
  offers: OfferContext[];
  knowledge: KnowledgeContext[];
}

const MAX_KNOWLEDGE_ITEMS = 6;
const MAX_KNOWLEDGE_CHARS = 900;
const MAX_ITEMS = 60;
const CONTEXT_CACHE_TTL_MS = 60_000;

interface CachedContext {
  expiresAt: number;
  context: TenantAiContext;
}

const contextCache = new Map<string, CachedContext>();

export function invalidateAiContext(tenantId: string): void {
  contextCache.delete(tenantId);
}

const STOP_WORDS = new Set([
  "the","a","an","is","are","was","were","do","does","did","i","you","me","my","we","our",
  "to","of","in","on","at","for","and","or","but","if","then","so","not","no","yes","can",
  "could","would","should","will","shall","have","has","had","be","been","it","its","this",
  "that","these","those","with","from","by","as","about","how","what","when","where","which",
  "who","whom","please","thanks","thank","hi","hello","hey","ok","okay","ur","u","ki","ka",
  "ke","ko","hai","hain","kaun","kya","kitna","kitni","kyun","kyun","kab","jab","kahan",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u0600-\u06FF+]+/i)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function scoreKnowledge(
  entry: { title: string; category: string; content: string },
  queryTokens: string[]
): number {
  if (queryTokens.length === 0) return 0;

  const haystackTitle = tokenize(entry.title);
  const haystackBody = tokenize(entry.content);
  const haystack = new Set([...haystackTitle, ...haystackBody]);

  let score = 0;
  for (const token of queryTokens) {
    if (haystackTitle.includes(token)) score += 3;
    else if (haystack.has(token)) score += 1;
  }
  if (entry.category === "businessInfo") score += 0.5;
  if (entry.category === "faq") score += 0.25;
  return score;
}

function toTimestampMs(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return new Date(value).getTime();
  return 0;
}

export async function loadTenantAiContext(
  tenantId: string,
  query?: string
): Promise<TenantAiContext> {
  const cached = contextCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.context;
  }

  const context = await buildTenantAiContext(tenantId, query);
  contextCache.set(tenantId, {
    context,
    expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS,
  });
  return context;
}

interface RawTenantData {
  profile: Record<string, unknown>;
  aiSettings: Record<string, unknown>;
  delivery: Record<string, unknown>;
  categories: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  offers: Array<Record<string, unknown>>;
  knowledge: Array<{ title: string; category: string; content: string }>;
  currency: string;
}

async function loadRawTenantData(tenantId: string): Promise<RawTenantData> {
  const [
    profileSnap,
    aiSnap,
    deliverySnap,
    categoriesSnap,
    itemsSnap,
    offersSnap,
    knowledgeSnap,
  ] = await Promise.all([
    tenantDoc(tenantId, "profile", "main").get(),
    tenantDoc(tenantId, "settings", "ai").get(),
    tenantDoc(tenantId, "settings", "delivery").get(),
    tenantCollection(tenantId, "menuCategories")
      .where("status", "==", "active")
      .get(),
    tenantCollection(tenantId, "menuItems")
      .where("publicationStatus", "==", "published")
      .get(),
    tenantCollection(tenantId, "offers")
      .where("status", "==", "active")
      .get(),
    tenantCollection(tenantId, "knowledgeBase")
      .where("status", "==", "published")
      .get(),
  ]);

  return {
    profile: (profileSnap.data() ?? {}) as Record<string, unknown>,
    aiSettings: (aiSnap.data() ?? {}) as Record<string, unknown>,
    delivery: (deliverySnap.data() ?? {}) as Record<string, unknown>,
    categories: categoriesSnap.docs.map((doc) => doc.data()),
    items: itemsSnap.docs.map((doc) => doc.data()),
    offers: offersSnap.docs.map((doc) => doc.data()),
    knowledge: knowledgeSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        title: d.title || "",
        category: d.category || "",
        content: String(d.contentReference ?? d.content ?? "").slice(
          0,
          MAX_KNOWLEDGE_CHARS
        ),
      };
    }),
    currency: String((profileSnap.data() ?? {}).currency ?? "PKR"),
  };
}

async function buildTenantAiContext(
  tenantId: string,
  query?: string
): Promise<TenantAiContext> {
  const raw = await loadRawTenantData(tenantId);

  const profile = raw.profile;
  const aiSettings = raw.aiSettings;
  const delivery = raw.delivery;
  const currency = raw.currency;

  const categoriesMap = new Map<string, string>();
  const categories = raw.categories
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
    .map((d) => {
      const id = String(d.categoryId || d.id || "");
      categoriesMap.set(id, String(d.name || "Other"));
      return { categoryId: id, name: String(d.name || "Other") };
    });

  const items = raw.items.slice(0, MAX_ITEMS).map((d) => {
    const minor = Number(d.basePriceMinor || 0);
    return {
      itemId: String(d.itemId || d.id || ""),
      categoryName: categoriesMap.get(String(d.categoryId || "")) ?? "Other",
      name: String(d.name || ""),
      description: String(d.description || ""),
      priceLabel: `${currency} ${(minor / 100).toFixed(0)}`,
      availability: String(d.availability || "available"),
    };
  });

  const now = Date.now();
  const offers = raw.offers
    .filter((d) => {
      const end = toTimestampMs(d.endAt);
      const start = toTimestampMs(d.startAt);
      return (!start || start <= now) && (!end || end >= now);
    })
    .map((d) => {
      const valueLabel =
        d.type === "percentage"
          ? `${d.valuePct}% off`
          : d.type === "fixedDiscount"
            ? `${currency} ${(Number(d.valueMinor ?? 0) / 100).toFixed(0)} off`
            : d.type === "freeDelivery"
              ? "Free delivery"
              : "Special offer";
      return {
        offerId: String(d.offerId ?? ""),
        name: String(d.name ?? ""),
        description: String(d.description ?? ""),
        valueLabel,
        minOrderLabel: d.minOrderMinor
          ? `${currency} ${(Number(d.minOrderMinor) / 100).toFixed(0)} minimum`
          : null,
      };
    });

  const queryTokens = tokenize(query ?? "");
  const knowledge = raw.knowledge
    .map((entry) => ({ entry, score: scoreKnowledge(entry, queryTokens) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_KNOWLEDGE_ITEMS)
    .map(({ entry }) => ({
      title: entry.title,
      category: entry.category,
      content: entry.content,
    }));

  const deliveryFeeMinor = Number(delivery.deliveryFeeMinor ?? 0);
  const minimumOrderMinor = Number(delivery.minimumOrderMinor ?? 0);

  const business: BusinessContext = {
    name: String(profile.businessName ?? ""),
    types: Array.isArray(profile.businessType) ? profile.businessType : ["restaurant"],
    phone: (profile.phone as string) || null,
    address: (profile.address as string) || null,
    hours: (profile.hours as string) || null,
    deliveryFeeLabel: deliveryFeeMinor
      ? `${currency} ${(deliveryFeeMinor / 100).toFixed(0)} delivery fee`
      : "Free delivery",
    minimumOrderLabel: minimumOrderMinor
      ? `${currency} ${(minimumOrderMinor / 100).toFixed(0)} minimum order`
      : null,
    deliveryArea: (delivery.deliveryArea as string) || null,
    pickupAvailable: delivery.pickupAvailable !== false,
    paymentMethods: (delivery.paymentMethods as string) || null,
    orderInstructions: (delivery.orderInstructions as string) || null,
    currentDate: new Date().toISOString().slice(0, 10),
  };

  return {
    businessName: business.name,
    businessTypes: business.types,
    currency,
    business,
    aiSettings: {
      greeting: (aiSettings.greeting as string) ?? null,
      language: (aiSettings.language as string) ?? "en",
      tone: (aiSettings.tone as string) ?? null,
      handoffNote: (aiSettings.handoffNote as string) ?? null,
    },
    menu: { categories, items },
    offers,
    knowledge,
  };
}
