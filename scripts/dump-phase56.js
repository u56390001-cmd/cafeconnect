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
  const bookings = await db.collection(`tenants/${TENANT}/bookings`).orderBy("createdAt", "desc").limit(3).get();
  console.log("BOOKINGS (latest)");
  for (const b of bookings.docs) {
    const d = b.data();
    console.log(` ${d.bookingId} ${d.date} ${d.time} size=${d.partySize} status=${d.status} by=${d.createdBy} name=${d.customerName}`);
  }

  const convs = await db.collection(`tenants/${TENANT}/conversations`).get();
  console.log("\nCONVERSATIONS with handoff/aiEnabled");
  for (const c of convs.docs) {
    const d = c.data();
    if (d.handoff || d.aiEnabled === false) {
      console.log(
        ` ${c.id} status=${d.status} aiEnabled=${d.aiEnabled} handoff=${JSON.stringify(d.handoff).slice(0, 160)}`
      );
    }
  }

  const reminders = await db.collection(`tenants/${TENANT}/reminders`).get();
  console.log(`\nREMINDERS (${reminders.size})`);
  for (const r of reminders.docs) {
    const d = r.data();
    console.log(` ${d.reminderId} type=${d.type} status=${d.status} at=${d.scheduledAt?.toDate?.().toISOString?.() ?? d.scheduledAt}`);
  }

  const orders = await db.collection(`tenants/${TENANT}/orders`).orderBy("createdAt", "desc").limit(2).get();
  console.log("\nORDERS (latest) attribution");
  for (const o of orders.docs) {
    const d = o.data();
    console.log(` ${d.orderNumber} attr=${JSON.stringify(d.attribution)}`);
  }
  process.exit(0);
})();
