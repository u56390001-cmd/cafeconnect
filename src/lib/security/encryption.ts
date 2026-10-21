import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

function getEncryptionKey(
  password: string,
  salt: Buffer
): Promise<Buffer> {
  return scryptAsync(password, salt, KEY_LENGTH) as Promise<Buffer>;
}

export interface EncryptedPayload {
  ciphertext: string;
  nonceOrIv: string;
  authTag: string;
  keyVersion: number;
  salt: string;
}

export async function encrypt(plaintext: string, encryptionKey: string, keyVersion: number): Promise<EncryptedPayload> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await getEncryptionKey(encryptionKey, salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(String(keyVersion), "utf8"));

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    nonceOrIv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion,
    salt: salt.toString("base64"),
  };
}

export async function decrypt(
  payload: EncryptedPayload,
  encryptionKey: string
): Promise<string> {
  const salt = Buffer.from(payload.salt, "base64");
  const key = await getEncryptionKey(encryptionKey, salt);
  const iv = Buffer.from(payload.nonceOrIv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(String(payload.keyVersion), "utf8"));

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function maskHint(value: string): string {
  if (!value || value.length < 8) return "••••••••";
  const tail = value.slice(-4).replace(/[^\w]/g, "");
  return tail ? `••••••${tail}` : "••••••••";
}
