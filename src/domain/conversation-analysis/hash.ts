import { createHash } from "node:crypto";

export function phoneHash(phone: string): string {
  return createHash("sha256").update(phone).digest("hex").slice(0, 16);
}
