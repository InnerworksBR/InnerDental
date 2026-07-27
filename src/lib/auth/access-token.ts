import "server-only";

import { createHash, randomBytes } from "node:crypto";

const ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000;

export type IssuedAccessToken = {
  token: string;
  tokenHash: string;
  expiresAt: Date;
};

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function issueAccessToken(now = new Date()): IssuedAccessToken {
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    tokenHash: hashAccessToken(token),
    expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
  };
}
