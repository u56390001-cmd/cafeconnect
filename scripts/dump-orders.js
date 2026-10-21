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
const TENANT = process.argv[2] || "00wnUFnHmaFu7I3fASMh";
(async () => {
  const snap = await db.collection(`tenants/${TENANT}/orders`).orderBy("createdAt", "desc").limit(5).get();
  console.log("=== latest orders ===");
  for (const d of snap.docs) {
    const x = d.data();
    console.log(` ${x.orderNumber} ch=${x.channel} status=${x.status} pay=${x.paymentStatus}`);
    console.log(`   subtotal=${x.subtotalMinor} discount=${x.discountMinor} delivery=${x.deliveryFeeMinor} total=${x.totalMinor} (${(x.totalMinor / 100).toFixed(2)})`);
    console.log(`   items=${JSON.stringify(x.items)}`);
    console.log(`   customer=${JSON.stringify(x.customer)} fulfilment=${JSON.stringify(x.fulfilment)}`);
  }
  process.exit(0);
})();
