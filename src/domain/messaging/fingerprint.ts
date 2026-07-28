import { createHash } from "node:crypto";

function normalizedMessageText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

export function whatsappMessageFingerprint(phone: string, text: string): string {
  return createHash("sha256").update(`${phone}\0${normalizedMessageText(text)}`, "utf8").digest("hex");
}
