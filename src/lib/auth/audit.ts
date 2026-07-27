import "server-only";

import { createHash } from "node:crypto";

export function redactPhoneForAudit(phone: string): string {
  return createHash("sha256").update(phone).digest("hex").slice(0, 12);
}
