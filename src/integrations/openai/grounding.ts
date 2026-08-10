import type { VerifiedFacts } from "../../domain/knowledge/verified-facts.ts";

const safeNarrativeWords = new Set([
  "a", "ao", "aos", "as", "com", "da", "das", "de", "do", "dos", "e", "em", "esta", "estao", "fica", "funciona", "informacao", "na", "nas", "no", "nos", "o", "os", "para", "por", "que", "sim", "tem", "temos", "uma", "um", "voce", "voces",
]);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b0+(\d)/g, "$1")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function urlsIn(value: string) {
  const candidates = value.match(/https?:\/\/[^\s)\]}]+|www\.[^\s)\]}]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/gi) ?? [];
  return candidates.map((url) => url.replace(/[.,;!?]+$/, ""));
}

function linkTargetsIn(value: string) {
  const markdownTargets = [...value.matchAll(/\[[^\]]+\]\(([^)]*)\)/g)].map((match) => match[1].trim());
  const htmlTargets = [...value.matchAll(/\bhref\s*=\s*["']([^"']*)["']/gi)].map((match) => match[1].trim());
  return [...markdownTargets, ...htmlTargets];
}

export type GroundedReplyValidation =
  | { valid: true }
  | { valid: false; reason: "URL" | "CRITICAL_CLAIM" | "UNVERIFIED_FACT" };

export function validateGroundedFaqReply(message: string, facts: Pick<VerifiedFacts, "faq">): GroundedReplyValidation {
  const source = facts.faq?.answer;
  if (!source) return { valid: false, reason: "UNVERIFIED_FACT" };

  const normalizedSource = normalize(source);
  const hasUngroundedUrl = urlsIn(message).some((url) => !normalizedSource.includes(normalize(url)));
  const hasUngroundedLinkTarget = linkTargetsIn(message).some((target) => !target || target === "#" || !normalizedSource.includes(normalize(target)));
  if (hasUngroundedUrl || hasUngroundedLinkTarget) return { valid: false, reason: "URL" };

  if (/\b(convenio|convenios|plano|planos|cobertura|coberto|coberta|procedimento|procedimentos|preco|precos|valor|valores|r\s*\$|horario disponivel|horarios disponiveis)\b/.test(normalize(message))) {
    return { valid: false, reason: "CRITICAL_CLAIM" };
  }

  const sourceWords = new Set(normalizedSource.split(" "));
  const unsupportedWord = normalize(message)
    .split(" ")
    .filter((word) => word.length > 2 && !safeNarrativeWords.has(word))
    .find((word) => !sourceWords.has(word));
  return unsupportedWord ? { valid: false, reason: "UNVERIFIED_FACT" } : { valid: true };
}
