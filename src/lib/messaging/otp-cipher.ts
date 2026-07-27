import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(secret: string): Buffer {
  if (secret.length < 32) throw new Error("OTP_ENCRYPTION_SECRET_INVALID");
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptOtp(code: string, secret: string): string {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptOtp(value: string, secret: string): string {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) throw new Error("OTP_CIPHERTEXT_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
