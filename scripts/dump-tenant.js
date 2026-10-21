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
const TENANT = process.argv[2];
(async () => {
  for (const col of ["menuCategories", "menuItems", "offers", "knowledgeBase"]) {
    const snap = await db.collection(`tenants/${TENANT}/${col}`).get();
    console.log(`\n=== ${col} (${snap.size}) ===`);
    for (const d of snap.docs) console.log(" ", d.id, JSON.stringify(d.data()).slice(0, 260));
  }
  for (const sub of ["profile/main", "settings/ai", "settings/delivery", "settings/whatsapp"]) {
    const parts = sub.split("/");
    const snap = await db.collection(`tenants/${TENANT}/${parts[0]}`).doc(parts[1]).get();
    console.log(`\n=== ${sub} ===`, snap.exists ? JSON.stringify(snap.data()).slice(0, 320) : "MISSING");
  }
  const widgets = await db.collection("widgetConfigs").get();
  console.log("\n=== widgetConfigs ===");
  for (const w of widgets.docs) console.log(" ", w.id, JSON.stringify(w.data()).slice(0, 200));
  process.exit(0);
})();
