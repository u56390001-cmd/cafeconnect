/**
 * Upload local product images to menu items via the production API.
 *
 * Usage:
 *   ACCOUNT_EMAIL=... ACCOUNT_PASSWORD=... node scripts/upload-item-images.js
 *
 * Mapping lives in IMAGES below (item id -> local file). Idempotent-ish:
 * running again appends another image rather than replacing.
 */
const { readFileSync } = require("fs");
const path = require("path");

const BASE_URL = process.env.APP_URL ?? "https://cafeconnect-rho.vercel.app";
const TENANT_ID = process.env.TENANT_ID ?? "00wnUFnHmaFu7I3fASMh";
const DIR = path.join(__dirname, "..", "items images");

const IMAGES = [
  ["4uJvX3iLmuZhltnhLNfv", "side-view-chicken-roll-grilled-chicken-lettuce-cucumber-tomato-mayo-pita_conv.jpg", "Chicken Shawarma"],
  ["CUB0QQjI0S9ocCTMLMuy", "traditional-hyderabadi-dish-background_conv.jpg", "Special Biryani (Chicken + Beef)"],
  ["Ew48c91RsQyQNsxPuum6", "delicious-crispy-chicken-burger-with-melted-cheese-lettuce-tomato-wooden-board_conv.jpg", "Chicken Burger"],
  ["OmvFNhwQyG2RZvCX3aRq", "images (18).jfif", "Zinger Shawarma"],
  ["QswMO0xmo5bFQE6fWakg", "gourmet-chicken-biryani-with-steamed-basmati-rice-generated-by-ai_conv.jpg", "Chicken Biryani Half"],
  ["a44bXAS2Ncg35R9AGsx4", "authentic-chicken-tikka-biryani-png.webp", "Chicken Tikka Biryani"],
  ["kBweZZEpe7F4mQkP2VyP", "360_F_775568354_h80obnzsU49s7Yo8pymVwp1i9e9c8z1y.jpg", "Chicken Briyani Full"],
  ["mXExSI3K6It6YOqyOap4", "images (17).jfif", "Cheese Pizza (Medium)"],
  ["O9KM1NfgEVBfjulxUCYt", "360_F_931106955_Sfxxki9r9wgQncILNdKhkdV2pErfeeDN.jpg", "Beef Biryani"],
  ["ouU8CB8VoM71FBLgnuAf", "high-angle-shot-delicious-pizza-with-colorful-bell-peppers-corn-meat-mushrooms_conv.jpg", "Chicken Fajita Pizza (Medium)"],
  ["r2rLCNn7FjT3Hzzbj6Si", "images (16).jfif", "Beef Burger"],
];

const CONTENT_TYPES = { ".jpg": "image/jpeg", ".jfif": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

async function login() {
  const envFile = readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const line = envFile
    .split(/\r?\n/)
    .find((l) => l.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY="));
  const anon = line?.split("=").slice(1).join("=");
  const supabaseUrl = envFile
    .split(/\r?\n/)
    .find((l) => l.startsWith("NEXT_PUBLIC_SUPABASE_URL="))
    ?.split("=")
    .slice(1)
    .join("=");
  if (!anon) throw new Error("anon key missing from .env.local");
  const email = process.env.ACCOUNT_EMAIL;
  const password = process.env.ACCOUNT_PASSWORD;
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.access_token;
}

async function uploadImage(token, itemId, fileName, altText) {
  const buffer = readFileSync(path.join(DIR, fileName));
  const ext = path.extname(fileName).toLowerCase();
  const type = CONTENT_TYPES[ext] ?? "image/jpeg";
  const form = new FormData();
  form.append("file", new Blob([buffer], { type }), fileName);
  form.append("altText", altText);
  const res = await fetch(`${BASE_URL}/api/menu/items/${itemId}/images?tenantId=${TENANT_ID}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${itemId}: HTTP ${res.status} ${text.slice(0, 200)}`);
  const body = JSON.parse(text);
  const image = body.data?.image ?? {};
  return { assetId: image.assetId, url: image.url };
}

(async () => {
  const token = await login();
  const results = [];
  for (const [itemId, fileName, label] of IMAGES) {
    try {
      const out = await uploadImage(token, itemId, fileName, label);
      console.log(`OK ${label} (${itemId}) -> ${out.assetId}`);
      results.push({ itemId, label, ...out });
    } catch (error) {
      console.error(`FAIL ${label} (${itemId}): ${error.message}`);
      process.exitCode = 1;
    }
  }
  require("fs").writeFileSync(
    path.join(__dirname, "uploaded-images.json"),
    JSON.stringify(results, null, 2)
  );
  console.log(`done: ${results.filter(Boolean).length}/${IMAGES.length}`);
})();
