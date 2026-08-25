import type { RoutingContext, RoutingDecision, ToolName } from "./router-types.ts";
import type { VerifiedFacts } from "../../domain/knowledge/verified-facts.ts";

const safeNarrativeWords = new Set([
  "a", "ao", "aos", "as", "com", "da", "das", "de", "do", "dos", "e", "em", "esta", "estao", "fica", "funciona", "informacao", "na", "nas", "no", "nos", "o", "os", "para", "por", "que", "sim", "tem", "temos", "uma", "um", "voce", "voces",
]);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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

/**
 * Allowlist of router tools enforced by `validateRouterDecision`. Mirrors the
 * `ToolName` union in `./router-types.ts`; kept here (rather than imported
 * from the schema) so this module stays free of OpenAI dependencies.
 */
const ROUTER_TOOL_ALLOWLIST: readonly ToolName[] = [
  "request_scheduling_link",
  "answer_plan",
  "answer_plan_list",
  "answer_procedure",
  "answer_procedure_list",
  "answer_coverage",
  "answer_child_policy",
  "answer_faq",
  "ask_plan",
  "accept_plan",
  "reject_plan",
  "ask_procedure",
  "confirm_attendance",
  "lookup_upcoming_appointment",
  "handoff",
  "greet",
  "send_questions_menu",
  "send_unsupported_media_reply",
];

export type RouterDecisionValidation =
  | { valid: true }
  | { valid: false; reason: "UNKNOWN_TOOL" | "MISSING_SLOT" | "INVALID_ARGUMENT" };

/**
 * Pure validation of a `RoutingDecision` produced by the LLM router. The
 * function never calls OpenAI and never mutates input — the worker uses the
 * return value to decide between executing the tool, falling back to regex,
 * or dead-lettering the row.
 *
 * Scope (PR 2):
 * - Every tool name must belong to the static allowlist (the Zod schema in
 *   `chat.ts` already enforces this when the response is parsed, but the
 *   runtime allowlist is the source of truth for `routing_mode` filtering).
 * - `arguments` must be a plain object (Zod enforces `Record<string, unknown>`).
 *
 * Slot validation (MISSING_SLOT) is intentionally deferred to PR 3, where the
 * per-tool schemas live. Until then, `validateRouterDecision` always returns
 * `valid: true` for a decision whose names are allowlisted.
 *
 * @param decision  Parsed router decision (already Zod-validated).
 * @param context   Routing context the decision was made against. Reserved
 *                  for the PR 3 slot checks; unused today.
 */
export function validateRouterDecision(decision: RoutingDecision, _context: RoutingContext): RouterDecisionValidation {
  for (const call of decision.calls) {
    if (!ROUTER_TOOL_ALLOWLIST.includes(call.name)) {
      return { valid: false, reason: "UNKNOWN_TOOL" };
    }
    if (call.arguments === null || typeof call.arguments !== "object" || Array.isArray(call.arguments)) {
      return { valid: false, reason: "INVALID_ARGUMENT" };
    }
  }
  return { valid: true };
}