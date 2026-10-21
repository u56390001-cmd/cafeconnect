const fs = require("fs");
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const admin = require("firebase-admin");
let privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/^"|"$/g, "").replace(/\\n/g, "\n");
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}
const db = admin.firestore();
const TENANT = "00wnUFnHmaFu7I3fASMh";

// Mirrors src/lib/ai/recommendations.ts against the real tenant data.
(async () => {
  const [itemsSnap, ordersSnap] = await Promise.all([
    db.collection(`tenants/${TENANT}/menuItems`).where("publicationStatus", "==", "published").get(),
    db.collection(`tenants/${TENANT}/orders`).where("status", "==", "completed").limit(500).get(),
  ]);

  const counts = new Map();
  for (const doc of ordersSnap.docs) {
    for (const line of doc.data().items ?? []) {
      const id = line.itemId;
      if (!id) continue;
      const e = counts.get(id) ?? { name: line.name, q: 0, rev: 0 };
      e.q += Number(line.quantity ?? 0);
      e.rev += Number(line.lineTotalMinor ?? 0);
      counts.set(id, e);
    }
  }

  const published = itemsSnap.docs
    .map((d) => {
      const x = d.data();
      return {
        itemId: x.itemId || d.id,
        name: x.name,
        priceMinor: Number(x.basePriceMinor ?? 0),
        available: x.availability === "available",
        categoryId: x.categoryId ?? "",
      };
    })
    .filter((i) => i.available && i.priceMinor > 0);

  const budgetMinor = 100000; // PKR 1000
  const cartItemIds = new Set([]);
  const popularById = new Map([...counts].map(([id, v]) => [id, v]));

  const scored = published
    .filter((i) => !cartItemIds.has(i.itemId))
    .map((i) => {
      const sold = popularById.get(i.itemId);
      return { item: i, score: sold ? sold.q * 10 : 0, sold };
    })
    .sort((a, b) => b.score - a.score);

  const recs = [];
  let total = 0;
  for (const entry of scored) {
    if (recs.length >= 4) break;
    if (total + entry.item.priceMinor > budgetMinor) continue;
    recs.push({
      itemId: entry.item.itemId,
      name: entry.item.name,
      priceMinor: entry.item.priceMinor,
      priceLabel: `PKR ${(entry.item.priceMinor / 100).toFixed(0)}`,
      reason: entry.sold ? `frequently ordered (${entry.sold.q} times)` : "goes well with the cart",
    });
    total += entry.item.priceMinor;
  }

  console.log("BUDGET: PKR 1000 (100000 minor)");
  for (const r of recs) {
    console.log(` - ${r.name} ${r.priceLabel} [${r.reason}]`);
  }
  const sum = recs.reduce((s, r) => s + r.priceMinor, 0);
  console.log(`total recommended: PKR ${(sum / 100).toFixed(0)} (within budget: ${sum <= budgetMinor})`);
  console.log(
    `all recommendations are published+available: ${recs.every((r) => published.some((p) => p.itemId === r.itemId))}`
  );
  process.exit(0);
})();
