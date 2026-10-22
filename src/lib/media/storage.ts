import { createSign } from "crypto";

/**
 * Dependency-free Google Cloud Storage client.
 *
 * The Firebase Spark (free) plan covers the storage we need (5 GB included),
 * so this project deliberately avoids the @google-cloud/storage SDK. Instead
 * the service account is exchanged for a short-lived OAuth token (signed JWT
 * with node:crypto) and the plain GCS JSON API is used.
 *
 * Only the server may call this - the browser never sees the credentials.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STORAGE_API = "https://storage.googleapis.com";
const SCOPE = "https://www.googleapis.com/auth/devstorage.read_write";

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function serviceAccount(): { clientEmail: string; privateKey: string } {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!clientEmail || !rawKey) {
    throw new Error("Missing Firebase service account for storage access");
  }
  return {
    clientEmail,
    privateKey: rawKey.replace(/\\n/g, "\n").replace(/^"|"$/g, ""),
  };
}

export function storageBucketName(): string {
  const bucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucket) {
    throw new Error("Missing storage bucket configuration");
  }
  return bucket;
}

/** Exchanges the service account for an access token (cached ~50 minutes). */
async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const { clientEmail, privateKey } = serviceAccount();
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    })
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(privateKey, "base64");
  const assertion = `${header}.${claims}.${base64Url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  if (!res.ok) {
    throw new Error(`Could not authorize storage access (${res.status})`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Storage authorization did not return a token");
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

export interface StoredObject {
  name: string;
  size: number;
  contentType: string;
}

/** Uploads binary content and returns the stored object metadata. */
export async function uploadObject(
  path: string,
  body: Buffer,
  contentType: string
): Promise<StoredObject> {
  const token = await accessToken();
  const url = `${STORAGE_API}/upload/storage/v1/b/${encodeURIComponent(
    storageBucketName()
  )}/o?uploadType=media&name=${encodeURIComponent(path)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
    body: new Uint8Array(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Storage upload failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    name?: string;
    size?: string;
    contentType?: string;
  };
  return {
    name: data.name ?? path,
    size: Number(data.size ?? body.length),
    contentType: data.contentType ?? contentType,
  };
}

/** Downloads an object, or returns null when it does not exist. */
export async function downloadObject(
  path: string
): Promise<{ body: Buffer; contentType: string } | null> {
  const token = await accessToken();
  const url = `${STORAGE_API}/download/storage/v1/b/${encodeURIComponent(
    storageBucketName()
  )}/o/${encodeURIComponent(path)}?alt=media`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Storage download failed (${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return {
    body: Buffer.from(arrayBuffer),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

/** Deletes an object. Missing files are ignored. */
export async function deleteObject(path: string): Promise<void> {
  const token = await accessToken();
  const url = `${STORAGE_API}/storage/v1/b/${encodeURIComponent(
    storageBucketName()
  )}/o/${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Storage delete failed (${res.status})`);
  }
}

/** Lists object names under a prefix (used for cleanup). */
export async function listObjects(prefix: string): Promise<string[]> {
  const token = await accessToken();
  const url = `${STORAGE_API}/storage/v1/b/${encodeURIComponent(
    storageBucketName()
  )}/o?prefix=${encodeURIComponent(prefix)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: Array<{ name?: string }> };
  return (data.items ?? [])
    .map((item) => item.name)
    .filter((name): name is string => Boolean(name));
}
