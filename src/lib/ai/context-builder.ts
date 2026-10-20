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

export interface TenantAiContext {
  businessName: string;
  businessTypes: string[];
  currency: string;
  aiSettings: {
    greeting: string | null;
    language: string;
    tone: string | null;
  };
  menu: MenuContext;
  offers: OfferContext[];
  knowledge: KnowledgeContext[];
}

const MAX_KNOWLEDGE_ITEMS = 8;
const MAX_KNOWLEDGE_CHARS = 1200;
const MAX_ITEMS = 100;

export async function loadTenantAiContext(
  tenantId: string
): Promise<TenantAiContext> {
  const [profileSnap, aiSnap, categoriesSnap, itemsSnap, offersSnap, knowledgeSnap] =
    await Promise.all([
      tenantDoc(tenantId, "profile", "main").get(),
      tenantDoc(tenantId, "settings", "ai").get(),
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

  const profile = profileSnap.data() ?? {};
  const aiSettings = aiSnap.data() ?? {};
  const currency = String(profile.currency ?? "PKR");

  const categoriesMap = new Map<string, string>();
  const categories = categoriesSnap.docs
    .sort((a, b) => (a.data().sortOrder ?? 0) - (b.data().sortOrder ?? 0))
    .map((doc) => {
      const d = doc.data();
      const id = d.categoryId || doc.id;
      categoriesMap.set(id, d.name || "Other");
      return { categoryId: id, name: d.name || "Other" };
    });

  const items = itemsSnap.docs.slice(0, MAX_ITEMS).map((doc) => {
    const d = doc.data();
    const minor = Number(d.basePriceMinor || 0);
    return {
      itemId: d.itemId || doc.id,
      categoryName: categoriesMap.get(d.categoryId || "") ?? "Other",
      name: d.name || "",
      description: d.description || "",
      priceLabel: `${currency} ${(minor / 100).toFixed(0)}`,
      availability: d.availability || "available",
    };
  });

  const offers = offersSnap.docs
    .filter((doc) => {
      const d = doc.data();
      const now = Date.now();
      const end = d.endAt
        ? d.endAt instanceof Timestamp
          ? d.endAt.toMillis()
          : new Date(d.endAt as string).getTime()
        : 0;
      const start = d.startAt
        ? d.startAt instanceof Timestamp
          ? d.startAt.toMillis()
          : new Date(d.startAt as string).getTime()
        : 0;
      return (!start || start <= now) && (!end || end >= now);
    })
    .map((doc) => {
      const d = doc.data();
      const valueLabel =
        d.type === "percentage"
          ? `${d.valuePct}% off`
          : d.type === "fixedDiscount"
            ? `${currency} ${(Number(d.valueMinor ?? 0) / 100).toFixed(0)} off`
            : d.type === "freeDelivery"
              ? "Free delivery"
              : "Special offer";
      return {
        offerId: d.offerId || doc.id,
        name: d.name || "",
        description: d.description || "",
        valueLabel,
        minOrderLabel: d.minOrderMinor
          ? `${currency} ${(Number(d.minOrderMinor) / 100).toFixed(0)} minimum`
          : null,
      };
    });

  const knowledge: KnowledgeContext[] = knowledgeSnap.docs
    .slice(0, MAX_KNOWLEDGE_ITEMS)
    .map((doc) => {
      const d = doc.data();
      return {
        title: d.title || "",
        category: d.category || "",
        content: String(d.contentReference || "").slice(0, MAX_KNOWLEDGE_CHARS),
      };
    });

  return {
    businessName: String(profile.businessName ?? ""),
    businessTypes: Array.isArray(profile.businessType)
      ? profile.businessType
      : ["restaurant"],
    aiSettings: {
      greeting: (aiSettings.greeting as string) ?? null,
      language: (aiSettings.language as string) ?? "en",
      tone: (aiSettings.tone as string) ?? null,
    },
    currency,
    menu: { categories, items },
    offers,
    knowledge,
  };
}
