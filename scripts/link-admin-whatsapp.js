const fs = require("fs");
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const admin = require("firebase-admin");
const crypto = require("crypto");
const { promisify } = require("util");
const scryptAsync = promisify(crypto.scrypt);

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
const PROVIDER_BASE = (process.env.QR_PROVIDER_BASE_URL || "https://whatsapp.qasimhussain.com").replace(/\/+$/, "");
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://cafeconnect-rho.vercel.app").replace(/\/+$/, "");

async function encryptSecret(plaintext, masterKey) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(masterKey, salt, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("1", "utf8"));
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: enc.toString("base64"),
    nonceOrIv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: 1,
    salt: salt.toString("base64"),
  };
}

(async () => {
  const tenantRef = db.collection("tenants").doc(TENANT);
  const settingsRef = tenantRef.collection("settings").doc("whatsapp");

  // 1) tenant provider key (saved by the tenant) else platform key
  const keysSnap = await tenantRef.collection("apiKeys").get();
  const qrKeyDoc = keysSnap.docs.find((d) => d.data().provider === "qr_provider");
  let providerToken;
  if (qrKeyDoc) {
    const d = qrKeyDoc.data();
    const key = await crypto.promises;
    const salt = Buffer.from(d.salt, "base64");
    const master = await scryptAsync(process.env.SECRET_ENCRYPTION_KEY, salt, 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", master, Buffer.from(d.nonceOrIv, "base64"));
    decipher.setAuthTag(Buffer.from(d.authTag, "base64"));
    decipher.setAAD(Buffer.from(String(d.keyVersion), "utf8"));
    const plain = Buffer.concat([decipher.update(d.ciphertext, "base64"), decipher.final()]);
    providerToken = plain.toString("utf8").trim();
  } else {
    providerToken = process.env.QR_PROVIDER_API_KEY.trim();
  }
  console.log("using tenant provider key:", Boolean(qrKeyDoc));

  // 2) ensure webhook token
  const settingsSnap = await settingsRef.get();
  const existing = settingsSnap.data();
  const webhookToken = existing?.qrWebhookToken || crypto.randomBytes(24).toString("hex");
  const webhookUrl = `${APP_URL}/api/webhooks/whatsapp/qr/${webhookToken}`;

  // 3) register webhook with provider
  const res = await fetch(`${PROVIDER_BASE}/api/webhook`, {
    method: "POST",
    headers: { Authorization: `Bearer ${providerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  const data = await res.json().catch(() => ({}));
  console.log("register webhook:", res.status, JSON.stringify(data).slice(0, 200));
  if (!data.webhook?.secret) {
    console.log("no secret returned; aborting");
    process.exit(1);
  }

  // 4) session status
  const sessionRes = await fetch(`${PROVIDER_BASE}/api/session`, {
    headers: { Authorization: `Bearer ${providerToken}` },
  });
  const session = await sessionRes.json().catch(() => ({}));
  console.log("session:", JSON.stringify(session).slice(0, 200));
  const phone = session.phone ? session.phone.replace(/\D/g, "") : null;

  // 5) persist settings (encrypted secret + trial state + mapping)
  const now = new Date();
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const encrypted = await encryptSecret(data.webhook.secret, process.env.SECRET_ENCRYPTION_KEY);

  await settingsRef.set(
    {
      tenantId: TENANT,
      mode: "qr_trial",
      provider: "qr_provider",
      status: "connected",
      qrWebhookToken: webhookToken,
      qrWebhookSecret: encrypted,
      qrTrial: {
        status: "connected",
        trialStartedAt: (existing?.qrTrial?.trialStartedAt || now.toISOString()),
        trialEndsAt: endsAt.toISOString(),
        linkedPhone: phone,
        messagesUsed: Number(existing?.qrTrial?.messagesUsed || 0),
        messageQuota: Number(existing?.qrTrial?.messageQuota || 500),
        lastHealthCheckAt: now.toISOString(),
        provider: "qr_provider",
        mode: "qr_trial",
        qr: session.qr || null,
      },
      updatedAt: now,
    },
    { merge: true }
  );

  await db.collection("qrWebhookTokens").doc(webhookToken).set({ tenantId: TENANT, createdAt: now }, { merge: true });

  if (phone) {
    await db.collection("whatsappSessions").doc(phone).set({ phone, tenantId: TENANT, provider: "qr_provider", updatedAt: now }, { merge: true });
  }

  console.log("webhook url:", webhookUrl);
  console.log("linked phone:", phone);
  process.exit(0);
})();
