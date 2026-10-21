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
(async () => {
  const carts = await db.collection(`tenants/${TENANT}/carts`).get();
  console.log(`CARTS (${carts.size})`);
  for (const c of carts.docs) {
    const d = c.data();
    console.log(
      ` ${c.id} status=${d.status} rev=${d.cartRevision} items=${JSON.stringify(
        d.items
      )} quote=${d.currentQuote?.totalLabel ?? "none"} customer=${JSON.stringify(
        d.customer
      )} fulfilment=${JSON.stringify(d.fulfilment)}`
    );
  }
  const convs = await db.collection(`tenants/${TENANT}/conversations`).get();
  for (const c of convs.docs) {
    const metrics = await c.ref.collection("turnMetrics").orderBy("createdAt", "desc").limit(3).get();
    if (metrics.empty) continue;
    console.log(`\nCONV ${c.id}`);
    for (const m of metrics.docs) {
      const x = m.data();
      console.log(
        `  model=${x.model} attempts=${x.attempts} tools=${JSON.stringify(
          x.toolCalls
        )} totalMs=${x.stages?.totalMs}`
      );
    }
  }
  process.exit(0);
})();
