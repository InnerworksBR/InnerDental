import "server-only";

import { randomInt } from "node:crypto";
import { hashAccessToken } from "@/lib/auth/access-token";

const OTP_TTL_MS = 5 * 60 * 1000;

export function issueOtp(now = new Date()) {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");

  return {
    code,
    codeHash: hashAccessToken(code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
  };
}
