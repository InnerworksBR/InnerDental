import { createHmac, timingSafeEqual } from "node:crypto";

export function signEvolutionPayload(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function verifyEvolutionSignature(body: string, provided: string | null, secret: string): boolean {
  if (!provided || !secret) return false;
  const normalized = provided.replace(/^sha256=/i, ""); const expected = signEvolutionPayload(body, secret);
  if (!/^[a-f0-9]{64}$/i.test(normalized) || normalized.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(normalized, "hex"), Buffer.from(expected, "hex"));
}

export function verifyEvolutionApiKey(provided: string | null | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
