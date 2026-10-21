/**
 * Pakistan-first language handling.
 *
 * Language/script detection is deterministic (no extra model call) so it can
 * run on every turn without adding latency. The detected mode is used for:
 *  - the prompt's locale layer (script mirroring),
 *  - localized fallback / acknowledgement / error strings,
 *  - localized tool error messages.
 */

export type LanguageMode = "en-PK" | "ur-PK" | "ur-Latn-PK" | "mixed-PK";

export interface DetectedLanguage {
  mode: LanguageMode;
  script: "latin" | "urdu" | "mixed";
  confidence: number;
}

const URDU_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Roman-Urdu markers that are not valid English words. */
const ROMAN_URDU_MARKERS = [
  "hai",
  "hain",
  "kya",
  "kyun",
  "kaise",
  "kahan",
  "kitna",
  "kitni",
  "batao",
  "bata",
  "chahiye",
  "chahye",
  "krdo",
  "kardo",
  "krd",
  "plz",
  "pls",
  "shukriya",
  "shukr",
  "assalam",
  "waalaikum",
  "assalamu",
  "zaroor",
  "theek",
  "thora",
  "thodi",
  "mangwa",
  "mangwaya",
  "bhejo",
  "bhej",
  "lagao",
  "laga",
  "order",
  "khana",
  "khane",
  "wala",
  "walao",
  "abhi",
  "bohat",
  "bahut",
  "bilkul",
  "nhi",
  "nahi",
  "maine",
  "mujhe",
  "mujhy",
  "kaisa",
  "paisay",
  "rupay",
  "sastay",
  "mehnat",
  "acha",
  "theek",
  "krwa",
  "krwaya",
  "wao",
  "usi",
  "un",
  "is",
  "ko",
  "ki",
  "ka",
  "ke",
  "par",
  "sath",
  "baad",
  "pehle",
  "phir",
  "bhi",
  "hi",
  "bhai",
  "karo",
  "kar",
  "karna",
  "kardo",
  "krdo",
  "krd",
  "aur",
  "ek",
  "do",
  "raakh",
  "rakh",
  "rakho",
  "lelo",
  "dedo",
  "dilao",
  "dekh",
  "dekho",
  "chuno",
  "bhej",
  "bhejo",
  "mangwa",
  "mangwaya",
  "chahye",
  "zyada",
  "kam",
  "jaldi",
  "waqt",
  "sirf",
  "bas",
  "bohat",
];

const ENGLISH_MARKERS = [
  "the",
  "is",
  "are",
  "please",
  "order",
  "want",
  "how",
  "much",
  "price",
  "menu",
  "delivery",
  "morning",
  "tonight",
  "thanks",
];

function countMatches(text: string, markers: string[]): number {
  let count = 0;
  for (const marker of markers) {
    const pattern = new RegExp(`(^|[^a-z])${marker}([^a-z]|$)`, "g");
    if (pattern.test(text)) count += 1;
  }
  return count;
}

/**
 * Detects the language/script of a message without a model call.
 * `preferred` is the tenant's configured default language.
 */
export function detectLanguage(
  message: string,
  preferred?: string | null
): DetectedLanguage {
  const text = (message ?? "").trim();
  if (!text) {
    return { mode: normalizeMode(preferred) ?? "en-PK", script: "latin", confidence: 0.2 };
  }

  const hasUrduScript = URDU_SCRIPT.test(text);
  const lower = text.toLowerCase();
  const latinWords = lower
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const urduMarkerHits = countMatches(lower, ROMAN_URDU_MARKERS);
  const englishMarkerHits = countMatches(lower, ENGLISH_MARKERS);

  // Urdu script present.
  if (hasUrduScript) {
    const latinRatio = latinWords.length
      ? latinWords.filter((w) => /^[a-z]+$/i.test(w)).length / latinWords.length
      : 0;
    if (latinRatio > 0.45) {
      return { mode: "mixed-PK", script: "mixed", confidence: 0.7 };
    }
    return { mode: "ur-PK", script: "urdu", confidence: 0.9 };
  }

  // Roman script: decide between English and Roman Urdu.
  const totalMarkers = urduMarkerHits + englishMarkerHits;
  if (totalMarkers === 0) {
    return {
      mode: normalizeMode(preferred) ?? "en-PK",
      script: "latin",
      confidence: 0.35,
    };
  }

  const urduShare = urduMarkerHits / totalMarkers;
  if (urduShare >= 0.5) {
    // Mixed when both languages are clearly present.
    if (englishMarkerHits > 0 && urduShare < 0.85) {
      return { mode: "mixed-PK", script: "mixed", confidence: 0.7 };
    }
    return { mode: "ur-Latn-PK", script: "latin", confidence: 0.8 };
  }

  if (englishMarkerHits > 0 && urduShare > 0.2) {
    return { mode: "mixed-PK", script: "mixed", confidence: 0.65 };
  }

  return { mode: "en-PK", script: "latin", confidence: 0.8 };
}

export function normalizeMode(value?: string | null): LanguageMode | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "en-pk" || v === "en" || v === "english") return "en-PK";
  if (v === "ur-pk" || v === "ur" || v === "urdu") return "ur-PK";
  if (v === "ur-latn-pk" || v === "roman-urdu" || v === "roman") return "ur-Latn-PK";
  if (v === "mixed-pk" || v === "mixed" || v === "hinglish") return "mixed-PK";
  return null;
}

export function isUrduScript(mode: LanguageMode): boolean {
  return mode === "ur-PK";
}

export function scriptInstruction(mode: LanguageMode): string {
  switch (mode) {
    case "ur-PK":
      return "Reply in Urdu (Urdu script), the way a helpful Pakistani restaurant staff member would write. Keep sentences short and natural.";
    case "ur-Latn-PK":
      return "Reply in Roman Urdu, the way customers type on WhatsApp (for example: 'Bilkul, main 2 biryani mangwa raha hoon'). Do not use formal English.";
    case "mixed-PK":
      return "Reply in natural mixed Urdu-English (Hinglish), matching how the customer is writing. Use English for item names and prices.";
    case "en-PK":
    default:
      return "Reply in simple, natural Pakistani English (short sentences, friendly tone).";
  }
}

/**
 * Localized strings for everything the model does not produce: fallbacks,
 * acknowledgements, tool errors and handoff messages.
 */
export interface LocalizedStrings {
  aiUnavailable: string;
  ack: string;
  orderCreated: (orderNumber: string, totalLabel: string) => string;
  orderConfirmCall: string;
  handoffNotice: string;
  minOrderNotMet: (minimumLabel: string) => string;
  outOfDeliveryArea: string;
  addressRequired: string;
  itemUnavailable: (itemName: string) => string;
  itemNotFound: string;
  invalidOrderRequest: string;
  invalidPhone: string;
  invalidName: string;
  quoteExpired: string;
  humanRequested: string;
}

const STRINGS: Record<LanguageMode, LocalizedStrings> = {
  "en-PK": {
    aiUnavailable:
      "Sorry, the assistant is having trouble right now. Please try again in a moment or contact us directly.",
    ack: "Got your message. Let me check this for you, I'll reply shortly.",
    orderCreated: (orderNumber, totalLabel) =>
      `Order #${orderNumber} received, total ${totalLabel}.`,
    orderConfirmCall:
      "Our team will call you within 10 minutes to confirm the order.",
    handoffNotice:
      "I am passing this to the team now. They will contact you shortly.",
    minOrderNotMet: (minimumLabel) =>
      `The minimum order is ${minimumLabel}. Please add a little more to continue.`,
    outOfDeliveryArea:
      "Sorry, this address may be outside our delivery area. Please share a nearby address or we will confirm with the team.",
    addressRequired: "Please share the full delivery address to continue.",
    itemUnavailable: (itemName) =>
      `${itemName} is not available right now. Would you like an alternative?`,
    itemNotFound: "I could not find that item on the menu. Could you re-check the name?",
    invalidOrderRequest: "I could not process that order request. Please re-check the items.",
    invalidPhone: "Please share a valid phone number (with country code).",
    invalidName: "Please share your name so we can confirm the order.",
    quoteExpired:
      "The prices may have changed, so I refreshed them. Shall I send the updated total?",
    humanRequested:
      "Of course, I am passing this to the team now. They will contact you shortly.",
  },
  "ur-PK": {
    aiUnavailable:
      "معذرت، ابھی معاونت میں کمی ہے۔ براہ کرم کچھ دیر بعد دوبارہ کوشش کریں یا ہم سے براہ راست رابطہ کریں۔",
    ack: "آپ کا پیغام مل گیا ہے۔ میں چیک کر رہا ہوں، جواب soon بھیج دیا جائے گا۔",
    orderCreated: (orderNumber, totalLabel) =>
      `آپ کا آرڈر #${orderNumber} موصول ہو گیا، کل رقم ${totalLabel}۔`,
    orderConfirmCall: "ہماری ٹیم 10 منٹ میں کال کر کے آرڈر کی تصدیق کرے گی۔",
    handoffNotice: "میں نے بات ٹیم کو بھیج دی ہے، وہ آپ سے جلدی رابطہ کریں گے۔",
    minOrderNotMet: (minimumLabel) =>
      `کم از کم آرڈر ${minimumLabel} ہے۔ براہ کرم تھوڑا اور شامل کریں۔`,
    outOfDeliveryArea:
      "معذرت، ممکن ہے یہ پتہ ہمارے ڈیلیوری ایریا سے باہر ہو۔ قریبی پتہ بتائیں یا ٹیم سے تصدیق کروا لیں۔",
    addressRequired: "آگے بڑھنے کے لیے مکمل ڈیلیوری پتہ بتائیں۔",
    itemUnavailable: (itemName) =>
      `${itemName} اس وقت دستیاب نہیں۔ کوئی اور آئٹم چاہیے؟`,
    itemNotFound: "میں نے مینو میں یہ آئٹم نہیں دیکھا۔ نام دوبارہ دیکھ لیں؟",
    invalidOrderRequest: "آرڈر ریکوئسٹ پراسیس نہیں ہو سکی۔ آئٹمز دوبارہ دیکھ لیں۔",
    invalidPhone: "براہ کرم درست فون نمبر (کنٹری کوڈ کے ساتھ) بتائیں۔",
    invalidName: "براہ کرم اپنا نام بتائیں تاکہ ہم آرڈر تصدیق کر سکیں۔",
    quoteExpired: "قیمیں تبدیل ہو سکتی ہیں، میں نے تازہ کر دی ہیں۔ نیا ٹوٹل بھیجوں؟",
    humanRequested: "ضرور، میں نے بات ٹیم کو بھیج دی ہے۔ وہ جلدی رابطہ کریں گے۔",
  },
  "ur-Latn-PK": {
    aiUnavailable:
      "Sorry, assistant thori der busy hai. Thora baad try kar lein ya hum se direct rabta karein.",
    ack: "Aap ka message mil gaya hai, main check kar raha hoon. Jawab foran bhej doonga.",
    orderCreated: (orderNumber, totalLabel) =>
      `Aap ka order #${orderNumber} receive ho gaya, total ${totalLabel}.`,
    orderConfirmCall: "Team 10 minute mein call karke order confirm kar degi.",
    handoffNotice: "Main ne baat team ko bhej di hai, woh jaldi rabta karenge.",
    minOrderNotMet: (minimumLabel) =>
      `Minimum order ${minimumLabel} hai. Thora aur add kar dein please.`,
    outOfDeliveryArea:
      "Sorry, yeh address shayad hamari delivery area se baahar hai. Qareeb ka address bata dein ya team se confirm kar lein.",
    addressRequired: "Order aage barhne ke liye poora delivery address bata dein.",
    itemUnavailable: (itemName) => `${itemName} abhi available nahi hai. Koi aur chalega?`,
    itemNotFound: "Menu mein yeh item nahi mila. Naam dobara check kar lein?",
    invalidOrderRequest: "Order request process nahi hui. Items dobara check kar lein.",
    invalidPhone: "Sahi phone number (country code ke sath) bata dein please.",
    invalidName: "Apna naam bata dein taake hum order confirm kar sakein.",
    quoteExpired: "Prices change ho sakte hain, main ne refresh kar diye. Naya total bhejun?",
    humanRequested: "Bilkul, main ne baat team ko bhej di hai, woh jaldi rabta karenge.",
  },
  "mixed-PK": {
    aiUnavailable:
      "Sorry, assistant abhi thoda busy hai. Thora baad try karein ya hum se direct contact karein.",
    ack: "Message mil gaya, main check kar raha hoon. Jawab foran bhejta hoon.",
    orderCreated: (orderNumber, totalLabel) =>
      `Order #${orderNumber} receive ho gaya, total ${totalLabel}.`,
    orderConfirmCall: "Team 10 minute mein call karke confirm karegi.",
    handoffNotice: "Main ne baat team ko bhej di hai, woh jaldi contact karenge.",
    minOrderNotMet: (minimumLabel) =>
      `Minimum order ${minimumLabel} hai, thora aur add karein please.`,
    outOfDeliveryArea:
      "Sorry, yeh address delivery area se baahar lagta hai. Qareeb ka address bata dein ya team se confirm kar lein.",
    addressRequired: "Order aage barhne ke liye poora address bata dein please.",
    itemUnavailable: (itemName) => `${itemName} abhi available nahi hai, koi aur lein?`,
    itemNotFound: "Menu mein yeh item nahi mila, naam dobara check karein?",
    invalidOrderRequest: "Order request process nahi hui, items dobara check karein.",
    invalidPhone: "Sahi phone number (country code ke sath) bata dein.",
    invalidName: "Apna naam bata dein taake order confirm ho sake.",
    quoteExpired: "Prices update ho gaye hain, refreshed total bhejun?",
    humanRequested: "Bilkul, team ko bhej diya hai, woh jaldi contact karenge.",
  },
};

export function stringsFor(mode: LanguageMode): LocalizedStrings {
  return STRINGS[mode] ?? STRINGS["en-PK"];
}
