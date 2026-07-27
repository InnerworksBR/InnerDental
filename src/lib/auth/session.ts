import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/config/env";

const TTL_SECONDS = 30 * 60;
export const sessionCookieName = "luna_session";

export function createSession(phone: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ phone, sid: randomUUID(), exp: Math.floor(now / 1000) + TTL_SECONDS })).toString("base64url");
  const signature = createHmac("sha256", getServerEnv().AUTH_SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readSession(value: string | undefined, now = Date.now()): { phone: string; sessionId: string } | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", getServerEnv().AUTH_SESSION_SECRET).update(payload).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof data.phone === "string" && typeof data.sid === "string" && /^[0-9a-f-]{36}$/i.test(data.sid) && Number.isInteger(data.exp) && data.exp > Math.floor(now / 1000) ? { phone: data.phone, sessionId: data.sid } : null;
  } catch { return null; }
}
