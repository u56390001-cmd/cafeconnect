/**
 * One-off admin utility (Supabase edition): make sure an email has a signable
 * auth account and a fully linked business workspace (tenant + owner
 * membership + profile).
 *
 * Usage:
 *   node scripts/fix-user-account.js <email> [<businessName>] [<businessType>]
 * Optional env:
 *   FIX_ACCOUNT_PASSWORD  force-reset the account's password (printed once)
 */
const fs = require("fs");
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !m[0].startsWith("#")) process.env[m[1]] = m[2];
}
const crypto = require("crypto");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

function headers(extra = {}) {
  return { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...extra };
}

async function req(url, method = "GET", body, extra = {}) {
  const res = await fetch(url, {
    method,
    headers: headers(extra),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${url}: ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return { status: res.status, data };
}

const rest = (path, method, body, extra) => req(`${SUPABASE_URL}/rest/v1/${path}`, method, body, extra);
const authAdmin = (path, method, body) => req(`${SUPABASE_URL}/auth/v1/admin/${path}`, method, body);

(async () => {
  const [email, ...restArgs] = process.argv.slice(2);
  if (!email) {
    console.error("Usage: node scripts/fix-user-account.js <email> [businessName] [businessType]");
    process.exit(1);
  }
  const businessName = restArgs[0] || "Sargodha Biryani & BBQ";
  const businessType = restArgs[1] || "restaurant";

  // 1. Auth account (create or reuse; optionally reset the password).
  let authUser;
  let created = false;
  const listAll = [];
  let page = 1;
  for (;;) {
    const found = await authAdmin(`users?page=${page}&per_page=200`);
    const got = found.data.users ?? [];
    if (!got.length) break;
    listAll.push(...got);
    if (got.length < 200) break;
    page += 1;
  }
  authUser = listAll.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase()) ?? null;
  if (!authUser) {
    const password = process.env.FIX_ACCOUNT_PASSWORD || crypto.randomBytes(9).toString("base64url") + "1aA";
    const res = await authAdmin("users", "POST", {
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: businessName },
    });
    authUser = res.data;
    created = true;
    console.log(`created auth user ${authUser.id}`);
    if (process.env.FIX_ACCOUNT_PASSWORD) console.log("password set from FIX_ACCOUNT_PASSWORD");
    else console.log(`TEMP PASSWORD: ${password}`);
  } else if (process.env.FIX_ACCOUNT_PASSWORD) {
    await authAdmin(`users/${authUser.id}`, "PUT", { password: process.env.FIX_ACCOUNT_PASSWORD });
    console.log(`password reset for ${authUser.id} from FIX_ACCOUNT_PASSWORD`);
  } else {
    console.log(`auth user exists ${authUser.id}`);
  }
  const uid = authUser.id;

  // 2. Resolve the imported users_profiles row by email; remap to auth uuid.
  let profileId = null;
  let profileData = null;
  const profiles = await rest("users_profiles?select=id,data");
  for (const p of profiles.data) {
    if ((p.data?.email ?? "").toLowerCase() === email.toLowerCase()) {
      profileId = p.id;
      profileData = p.data ?? {};
      break;
    }
  }
  // No imported profile row (e.g. auth user created by a failed signup run):
  // treat as a fresh workspace provisioning instead of failing.

  const nowIso0 = new Date().toISOString();
  let tenantId =
    profileData?.tenantId ??
    (profileId && profileId !== uid ? null : null);

  if (!tenantId) {
    // Fresh user -> create tenant + membership + profile rows.
    const tenantIdNew = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    tenantId = tenantIdNew;
    await rest("tenants", "POST", [
      {
        id: tenantId,
        business_name: businessName,
        business_type: [businessType],
        status: "active",
        owner_user_id: uid,
        country: "PK",
        currency: "PKR",
        timezone: "Asia/Karachi",
        enabled_modules: ["chat", "knowledge", "settings", "orders", "menu"],
        created_at: nowIso0,
        updated_at: nowIso0,
        data: {
          tenantId,
          businessName,
          businessType: [businessType],
          status: "active",
          ownerUserId: uid,
          country: "PK",
          currency: "PKR",
          timezone: "Asia/Karachi",
          enabledModules: ["chat", "knowledge", "settings", "orders", "menu"],
          createdAt: nowIso0,
          updatedAt: nowIso0,
        },
      },
    ]);
    await rest("tenant_members", "POST", [
      {
        tenant_id: tenantId,
        user_id: uid,
        role: "owner",
        status: "active",
        created_at: nowIso0,
        updated_at: nowIso0,
        data: {
          membershipId: uid,
          tenantId,
          userId: uid,
          role: "owner",
          status: "active",
          createdAt: nowIso0,
          updatedAt: nowIso0,
        },
      },
    ]);
    await rest("tenant_profiles", "POST", [
      {
        tenant_id: tenantId,
        business_name: businessName,
        business_type: [businessType],
        country: "PK",
        timezone: "Asia/Karachi",
        currency: "PKR",
        data: {
          businessName,
          businessType: [businessType],
          tenantId,
          hours: "Daily 12:00 PM - 12:00 AM",
          createdAt: nowIso0,
          updatedAt: nowIso0,
        },
      },
    ]);
    profileId = uid;
    await rest("users_profiles", "POST", [
      {
        id: uid,
        display_name: businessName,
        role: "owner",
        created_at: nowIso0,
        updated_at: nowIso0,
        data: {
          userId: uid,
          email,
          displayName: businessName,
          photoURL: null,
          tenantId,
          role: "owner",
          createdAt: nowIso0,
          updatedAt: nowIso0,
        },
      },
    ]);
    console.log(`fresh workspace provisioned: tenant ${tenantId}`);
    console.log(JSON.stringify({ ok: true, uid, profileId, tenantId, businessName, fresh: true }, null, 2));
    process.exit(0);
  }

  if (tenantId) {
    // Move users_profiles row to the auth uuid.
    if (profileId !== uid) {
      await rest(`users_profiles?id=eq.${encodeURIComponent(profileId)}`, "PATCH", {
        id: uid,
        data: { ...profileData, userId: uid },
      });
      // Keep membership rows pointing at the new id.
      await rest(`tenant_members?user_id=eq.${encodeURIComponent(profileId)}`, "PATCH", {
        user_id: uid,
        data: { userId: uid },
      });
      console.log(`remapped users_profiles ${profileId} -> ${uid}`);
    }
    profileId = uid;

    // Owner membership (create if missing).
    const memQs = `tenant_id=eq.${encodeURIComponent(tenantId)}&user_id=eq.${encodeURIComponent(uid)}`;
    const existing = await rest(`tenant_members?${memQs}`);
    if ((existing.data ?? []).length === 0) {
      const nowIso = new Date().toISOString();
      await rest("tenant_members", "POST", [
        {
          id: uid,
          tenant_id: tenantId,
          user_id: uid,
          role: "owner",
          status: "active",
          created_at: nowIso,
          updated_at: nowIso,
          data: {
            membershipId: uid,
            tenantId,
            userId: uid,
            role: "owner",
            status: "active",
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        },
      ]);
      console.log(`owner membership created for ${tenantId}`);
    }

    // Enrich tenant + profile rows if sparse.
    const tenantQs = await rest(`tenants?id=eq.${encodeURIComponent(tenantId)}&select=id,data`);
    const tenant = (tenantQs.data ?? [])[0] ?? null;
    if (tenant) {
      const patch = {};
      if (!tenant.data?.businessName) patch.data = { ...(tenant.data ?? {}), businessName, businessType: [businessType], ownerUserId: uid };
      if ((tenant.status ?? "") === "pending_setup") patch.status = "active";
      if (Object.keys(patch).length) {
        await rest(`tenants?id=eq.${encodeURIComponent(tenantId)}`, "PATCH", patch);
      }
    }
    const profQs = await rest(`tenant_profiles?tenant_id=eq.${encodeURIComponent(tenantId)}&select=tenant_id,data`);
    const prof = (profQs.data ?? [])[0] ?? null;
    if (prof && !prof.data?.businessName) {
      await rest(`tenant_profiles?tenant_id=eq.${encodeURIComponent(tenantId)}`, "PATCH", {
        business_name: businessName,
        business_type: [businessType],
        data: { ...prof.data, businessName, businessType: [businessType] },
      });
    }
  }

  console.log(JSON.stringify({ ok: true, uid, profileId, tenantId, businessName }, null, 2));
  process.exit(0);
})().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
