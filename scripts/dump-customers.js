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
  const customers = await db.collection(`tenants/${TENANT}/customers`).get();
  console.log(`CUSTOMERS (${customers.size})`);
  for (const c of customers.docs) {
    const d = c.data();
    console.log(
      ` ${c.id} name=${d.preferredName} lang=${d.preferredLanguage} memory=${d.memoryEnabled} consent=${d.consentStatus} seen=${d.lastSeenAt ? "yes" : "no"}`
    );
    const mem = await c.ref.collection("memories").get();
    for (const m of mem.docs) {
      const x = m.data();
      console.log(`    memory ${x.key} = ${x.value} (${x.sourceType}, ${x.status})`);
    }
  }
  const jobs = await db.collection(`tenants/${TENANT}/memoryJobs`).get();
  console.log(`\nMEMORY JOBS (${jobs.size})`);
  for (const j of jobs.docs.slice(0, 5)) {
    const d = j.data();
    console.log(` ${d.jobId} status=${d.status} attempts=${d.attempts} err=${d.lastErrorCode}`);
  }
  process.exit(0);
})();
