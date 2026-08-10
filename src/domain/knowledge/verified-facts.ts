import { findRequestedProcedure, triageInsurancePlan, type KnowledgeData } from "./service.ts";

export type VerifiedFacts = {
  plan?: KnowledgeData["plans"][number];
  planList?: KnowledgeData["plans"];
  procedure?: KnowledgeData["procedures"][number];
  procedureList?: KnowledgeData["procedures"];
  coverage?: { status: "accepted" | "not_covered" | "not_found"; instructions: string | null };
  faq?: KnowledgeData["faqs"][number];
};

export type VerifiedFactsResolution =
  | { kind: "resolved"; facts: VerifiedFacts; critical: boolean }
  | { kind: "ambiguous_plan" }
  | { kind: "price_unavailable" }
  | { kind: "not_found" };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function asksForPrice(message: string) {
  return /\b(preco|valor|quanto custa|quanto sai|custa|valores)\b/.test(normalize(message));
}

function asksForPlanList(message: string) {
  const value = normalize(message);
  return (/\b(quais|lista|todos|planos|convenios)\b/.test(value) && /\b(plano|planos|convenio|convenios)\b/.test(value))
    || (/\b(aceita|aceitam|aceito|aceitos|atende|atendem|trabalha|trabalham)\b/.test(value) && /\b(plano|planos|convenio|convenios)\b/.test(value));
}

function asksForProcedureList(message: string) {
  const value = normalize(message);
  return /\b(quais|lista|todos)\b/.test(value) && /\b(procedimentos|tratamentos|servicos)\b/.test(value);
}

function matchingFaq(message: string, data: KnowledgeData) {
  const normalizedMessage = normalize(message);
  const messageWords = new Set(normalizedMessage.split(" ").filter((word) => word.length > 3));
  return data.faqs.find((entry) => [entry.question, entry.answer]
    .flatMap((value) => normalize(value).split(" "))
    .filter((word) => word.length > 3)
    .some((word) => messageWords.has(word)));
}

export function resolveVerifiedFacts(
  message: string,
  data: KnowledgeData,
  context: { insurancePlanId?: string } = {},
): VerifiedFactsResolution {
  if (asksForPrice(message)) return { kind: "price_unavailable" };

  if (asksForPlanList(message) && data.plans.length > 0) {
    return { kind: "resolved", critical: true, facts: { planList: data.plans } };
  }

  const planResult = triageInsurancePlan(message, data);
  if (planResult.kind === "ambiguous") return { kind: "ambiguous_plan" };
  const contextPlan = context.insurancePlanId ? data.plans.find((entry) => entry.id === context.insurancePlanId) : undefined;
  const plan = planResult.kind === "accepted" && planResult.plan.id !== "particular" ? planResult.plan : contextPlan;
  const procedure = findRequestedProcedure(message, data);

  if (plan && procedure) {
    const coverage = procedure.id
      ? data.coverage?.find((entry) => entry.procedure_id === procedure.id && entry.insurance_plan_id === plan.id)
      : undefined;
    return {
      kind: "resolved",
      critical: true,
      facts: {
        plan,
        procedure,
        coverage: coverage ? { status: coverage.accepted ? "accepted" : "not_covered", instructions: coverage.instructions } : { status: "not_found", instructions: null },
      },
    };
  }

  if (plan) return { kind: "resolved", critical: true, facts: { plan } };
  if (procedure) return { kind: "resolved", critical: true, facts: { procedure } };

  if (asksForProcedureList(message) && data.procedures.length > 0) {
    return { kind: "resolved", critical: true, facts: { procedureList: data.procedures } };
  }

  const faq = matchingFaq(message, data);
  if (faq) return { kind: "resolved", critical: false, facts: { faq } };
  return { kind: "not_found" };
}
