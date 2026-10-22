import { createHmac, createHash } from "crypto";

/**
 * Dependency-free Backblaze B2 (S3-compatible) client.
 *
 * Firebase Storage buckets now require a billing-enabled project, so product
 * images live in a free Backblaze B2 bucket instead. The bucket is private;
 * the only access is through this signed S3 REST client and the app's own
 * media routes, so the browser never sees the credentials.
 *
 * AWS SigV4 signing is implemented with node:crypto - no SDK dependency.
 * Only the server may call this (never ship these env keys to the client).
 */

/* body-hash: uploads are sent unsigned (B2 accepts UNSIGNED-PAYLOAD) */
const UNSIGNED_SHA = "UNSIGNED-PAYLOAD";

interface S3Setup {
  host: string;
  bucket: string;
  keyId: string;
  appKey: string;
  region: string;
}

function s3Config(): S3Setup {
  const host = process.env.B2_S3_ENDPOINT;
  const bucket = process.env.B2_BUCKET ?? process.env.FIREBASE_STORAGE_BUCKET;
  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APP_KEY;
  if (!host || !bucket || !keyId || !appKey) {
    throw new Error(
      "Missing B2 storage configuration (B2_S3_ENDPOINT/B2_BUCKET/B2_KEY_ID/B2_APP_KEY)"
    );
  }
  // Endpoint looks like s3.us-east-005.backblazeb2.com; the region is embedded.
  const region = host.replace(/^s3\./, "").replace(/\.backblazeb2\.com$/, "");
  return { host, bucket, keyId, appKey, region };
}

function amzDate(date: Date): { amz: string; short: string } {
  const stamp = date
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d{3}/, "");
  return { amz: stamp, short: stamp.slice(0, 8) };
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function encodedSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!$&'()*+,;=:@]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`
  );
}

/** AWS style: percent-encoded, unreserved characters kept, sorted by key. */
function encodedQueryString(query: string): string {
  if (!query) return "";
  const [rawSearch] = query.startsWith("?") ? [query.slice(1)] : [query];
  const pairs = rawSearch
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const [name, value = ""] = pair.split("=");
      return { name: name.replace(/\+/g, " "), value: value.replace(/\+/g, " ") };
    })
    .sort((a, b) => (a.name === b.name ? (a.value < b.value ? -1 : 1) : a.name < b.name ? -1 : 1))
    .map((pair) => `${encodedSegment(pair.name)}=${encodedSegment(pair.value)}`);
  return pairs.length ? `?${pairs.join("&")}` : "";
}

async function s3Request(options: {
  method: string;
  /** Object key path relative to the bucket ("/" for bucket-level ops). */
  path: string;
  /** Query string starting with "?" or empty. */
  query?: string;
  contentType?: string;
  body?: Buffer;
}): Promise<Response> {
  const { host, bucket, keyId, appKey, region } = s3Config();
  const now = amzDate(new Date());
  const keyPath = options.path === "" ? "" : options.path.split("/").map(encodedSegment).join("/");
  const canonicalUri = `/${bucket}${keyPath ? `/${keyPath}` : "/"}`;
  const canonicalQuery = encodedQueryString(options.query ?? "").replace(/^\?/, "");

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": UNSIGNED_SHA,
    "x-amz-date": now.amz,
  };
  if (options.contentType) {
    headers["content-type"] = options.contentType;
  }

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name]}`)
    .join("\n");

  const canonicalRequest = [
    options.method,
    canonicalUri,
    canonicalQuery,
    `${canonicalHeaders}\n`,
    signedHeaderNames.join(";"),
    UNSIGNED_SHA,
  ].join("\n");

  const scope = `${now.short}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    now.amz,
    scope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${appKey}`, now.short), region), "s3"),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return fetch(`https://${host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ""}`, {
    method: options.method,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${signedHeaderNames.join(
        ";"
      )}, Signature=${signature}`,
    },
    body: options.body ? new Uint8Array(options.body) : undefined,
  });
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
  const res = await s3Request({ method: "PUT", path, contentType, body });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Storage upload failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return { name: path, size: body.length, contentType };
}

/** Downloads an object, or returns null when it does not exist. */
export async function downloadObject(
  path: string
): Promise<{ body: Buffer; contentType: string } | null> {
  const res = await s3Request({ method: "GET", path });
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
  const res = await s3Request({ method: "DELETE", path });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Storage delete failed (${res.status})`);
  }
}

/** Lists object names under a prefix (S3 ListObjectsV2, XML response). */
export async function listObjects(prefix: string): Promise<string[]> {
  const res = await s3Request({
    method: "GET",
    path: "",
    // encodedQueryString canonicalizes and encodes the raw prefix value.
    query: `?list-type=2&prefix=${prefix}`,
  });
  if (!res.ok) return [];
  const text = await res.text();
  const names: string[] = [];
  const keyPattern = /<Key>([^<]*)<\/Key>/g;
  let match: RegExpExecArray | null;
  while ((match = keyPattern.exec(text)) !== null) {
    names.push(match[1]);
  }
  return names;
}
