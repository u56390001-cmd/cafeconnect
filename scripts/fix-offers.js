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
  // 1) delivery fee back to PKR 100 (10000 minor units)
  await db
    .collection(`tenants/${TENANT}/settings`)
    .doc("delivery")
    .set({ deliveryFeeMinor: 10000, updatedAt: new Date() }, { merge: true });
  console.log("delivery fee set to 10000 minor (PKR 100)");

  // 2) find the Biryani category id
  const cats = await db.collection(`tenants/${TENANT}/menuCategories`).get();
  let biryaniId = null;
  for (const c of cats.docs) {
    if (String(c.data().name).toLowerCase() === "biryani") biryaniId = c.id;
  }
  console.log("biryani category:", biryaniId);

  // 3) scope the biryani offers to the Biryani category
  const offers = await db.collection(`tenants/${TENANT}/offers`).get();
  for (const o of offers.docs) {
    const name = String(o.data().name).toLowerCase();
    if (name.includes("biryani")) {
      await o.ref.set(
        { scopeCategoryIds: biryaniId ? [biryaniId] : [], updatedAt: new Date() },
        { merge: true }
      );
      console.log("scoped offer to biryani:", o.data().name);
    }
  }
  process.exit(0);
})();
