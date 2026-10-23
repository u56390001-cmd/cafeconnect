/**
 * One-shot Firestore export for the Supabase migration (fast version).
 * - Per-tenant subcollections: single get() each (no per-doc enumeration).
 * - conversations/{id}/messages: one global collectionGroup read, grouped.
 * Writes ./tmp-migration/firestore.json
 */
const fs = require("fs");
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !m[0].startsWith("#")) process.env[m[1]] = m[2];
}
const admin = require("firebase-admin");
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/^"|"$/g, "").replace(/\\n/g, "\n");
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

function jsonify(value) {
  if (value && value.toMillis) return new Date(value.toMillis()).toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonify);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = jsonify(v);
    }
    return out;
  }
  return value;
}

(async () => {
  const out = { users: [], tenants: [] };

  const usersSnap = await db.collection("users").get();
  out.users = usersSnap.docs.map((d) => jsonify({ ...d.data(), _id: d.id }));
  console.log(`users: ${out.users.length}`);

  const allGroups = await db.listCollections();
  console.log("root-level collectionGroup children:", allGroups.map((c) => c.id).join(", "));

  const tenantsSnap = await db.collection("tenants").get();
  for (const tdoc of tenantsSnap.docs) {
    console.log(`tenant ${tdoc.id} …`);
    const tenant = jsonify({ ...tdoc.data(), _id: tdoc.id });
    tenant.subcollections = {};
    const subs = await tdoc.ref.listCollections();
    for (const sub of subs) {
      const snap = await sub.get();
      tenant.subcollections[sub.id] = snap.docs.map((d) =>
        jsonify({ ...d.data(), _id: d.id })
      );
      console.log(`   ${sub.id}: ${tenant.subcollections[sub.id].length}`);
    }
    // Attach messages to their conversations via one collectionGroup query.
    if (tenant.subcollections.conversations) {
      const pathParts = `tenants/${tdoc.id}/conversations/`;
      tenant.subcollections.conversations = tenant.subcollections.conversations.map(
        (convo) => {
          convo._messages = (tenant._allMessages || []).filter((m) =>
            (m.__path || "").includes(pathParts + convo._id)
          );
          delete convo.__path;
          return convo;
        }
      );
    }
    out.tenants.push(tenant);
    out.tenants.total = undefined;
  }
  // rebuild tenant message maps (needs second pass because of grouping race)
  const msgsSnap = await db.collectionGroup("messages").get();
  console.log(`messages total: ${msgsSnap.size}`);
  const messagesByPath = {};
  for (const m of msgsSnap.docs) {
    const p = m.ref.path; // tenants/{tid}/conversations/{cid}/messages/{mid}
    const convoPath = p.split("/").slice(0, 5).join("/");
    (messagesByPath[convoPath] ||= []).push(jsonify({ ...m.data(), _id: m.id }));
  }
  for (const tenant of out.tenants) {
    const convos = tenant.subcollections?.conversations ?? [];
    const prefix = `tenants/${tenant._id}/conversations/`;
    for (const convo of convos) {
      convo._messages = messagesByPath[prefix + convo._id] || [];
    }
  }

  fs.mkdirSync("tmp-migration", { recursive: true });
  fs.writeFileSync("tmp-migration/firestore.json", JSON.stringify(out));
  const kb = (fs.statSync("tmp-migration/firestore.json").size / 1024).toFixed(0);
  console.log(`written tmp-migration/firestore.json (${kb} KB)`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
