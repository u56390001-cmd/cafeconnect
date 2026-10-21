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
  const convs = await db.collection(`tenants/${TENANT}/conversations`).get();
  for (const c of convs.docs) {
    const d = c.data();
    if (d.channel !== "whatsapp_qr") continue;
    console.log(`\nCONVERSATION ${d.conversationId} channel=${d.channel} from=${d.customerReference} messages=${d.messageCount}`);
    const msgs = await c.ref.collection("messages").orderBy("createdAt").get();
    for (const m of msgs.docs) {
      const x = m.data();
      console.log(`  [${x.direction}/${x.senderType}] ${x.content}`);
    }
  }
  process.exit(0);
})();
