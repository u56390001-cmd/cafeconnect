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
  const snap = await db.collection(`tenants/${TENANT}/apiKeys`).get();
  for (const d of snap.docs) {
    const x = d.data();
    if (x.provider === "gemini" && x.status !== "active") {
      await d.ref.delete();
      console.log("deleted stale gemini key:", d.id, x.maskedHint);
    }
  }
  const after = await db.collection(`tenants/${TENANT}/apiKeys`).get();
  for (const d of after.docs) {
    console.log("remaining:", d.data().provider, d.data().status, d.data().maskedHint);
  }
  process.exit(0);
})();
