import { findChildCarePolicy, findRequestedProcedure, isParticularPlan, normalizeKnowledgeTerm, triageInsurancePlan, type KnowledgeData } from "./service.ts";

export type VerifiedFacts = {
  plan?: KnowledgeData["plans"][number];
  planList?: KnowledgeData["plans"];
  procedure?: KnowledgeData["procedures"][number];
  procedureList?: KnowledgeData["procedures"];
  childPolicy?: KnowledgeData["procedures"][number];
  coverage?: { status: "accepted" | "not_covered" | "not_found"; instructions: string | null };
  faq?: KnowledgeData["faqs"][number];
};

export type VerifiedFactsResolution =
  | { kind: "resolved"; facts: VerifiedFacts; critical: boolean }
  | { kind: "ambiguous_plan" }
  | { kind: "price_unavailable" }
  | { kind: "not_found" };

function asksForPrice(message: string) {
  return /\b(preco|valor|quanto custa|quanto sai|custa|valores)\b/.test(normalizeKnowledgeTerm(message));
}

function asksForPlanList(message: string) {
  const value = normalizeKnowledgeTerm(message);
  return /\b(plano|planos|convenio|convenios)\b/.test(value)
    && /\b(quais|lista|todos|aceita|aceitam|aceito|aceitos|atende|atendem|trabalha|trabalham)\b/.test(value);
}

function asksForProcedureList(message: string) {
  const value = normalizeKnowledgeTerm(message);
  return /\b(quais|lista|todos)\b/.test(value) && /\b(procedimentos|tratamentos|servicos)\b/.test(value);
}

function asksForCoverage(message: string) {
  const value = normalizeKnowledgeTerm(message);
  return /\b(plano|convenio|cobertura|cobre|coberto|coberta|atende|aceita)\b/.test(value);
}

type FaqIntent = "location" | "hours" | "payment" | "parking" | "documents" | "scheduling";

function faqIntentFromMessage(message: string): FaqIntent | null {
  const value = normalizeKnowledgeTerm(message);
  if (/\b(endereco|localizacao|onde fica|sala)\b/.test(value)) return "location";
  if (/\b(horario de funcionamento|funcionamento|abre|fecha)\b/.test(value)) return "hours";
  if (/\b(pagamento|pagar|cartao|credito|debito|pix|parcelar)\b/.test(value)) return "payment";
  if (/\b(estacionamento|estacionar)\b/.test(value)) return "parking";
  if (/\b(documento|documentos|rg|cpf|carteirinha)\b/.test(value)) return "documents";
  if (/\b(marcar|agendar|remarcar|cancelar)\b/.test(value)) return "scheduling";
  return null;
}

function faqIntentFromEntry(entry: KnowledgeData["faqs"][number]): FaqIntent | null {
  const category = normalizeKnowledgeTerm(entry.category ?? "");
  if (/\b(localizacao|endereco|sala)\b/.test(category)) return "location";
  if (/\b(horario|funcionamento)\b/.test(category)) return "hours";
  if (/\b(pagamento|financeiro)\b/.test(category)) return "payment";
  if (/\b(estacionamento)\b/.test(category)) return "parking";
  if (/\b(documento)\b/.test(category)) return "documents";
  if (/\b(agendamento|agenda)\b/.test(category)) return "scheduling";

  // Older rows did not consistently categorize FAQs. Infer only from the question,
  // never the answer, so response text cannot create a self-reinforcing link loop.
  return faqIntentFromMessage(entry.question);
}

function matchingFaq(message: string, data: KnowledgeData) {
  const intent = faqIntentFromMessage(message);
  if (!intent) return null;
  const candidates = data.faqs.filter((entry) => faqIntentFromEntry(entry) === intent);
  return candidates.length === 1 ? candidates[0] : null;
}

function hasPaymentIntent(message: string) {
  return faqIntentFromMessage(message) === "payment";
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
  const explicitPlan = planResult.kind === "accepted" && !isParticularPlan(planResult.plan) ? planResult.plan : undefined;

  // Payment is operational information, not a procedure/coverage question.
  // It deliberately wins over a procedure noun in the same message so the
  // saved plan can never leak into a card/Pix response.
  if (hasPaymentIntent(message)) {
    const faq = matchingFaq(message, data);
    return faq ? { kind: "resolved", critical: false, facts: { faq } } : { kind: "not_found" };
  }

  const procedure = findRequestedProcedure(message, data);
  const childPolicy = findChildCarePolicy(message, data);
  const savedPlan = context.insurancePlanId && asksForCoverage(message)
    ? data.plans.find((entry) => entry.id === context.insurancePlanId)
    : undefined;
  const plan = explicitPlan ?? savedPlan;

  if (childPolicy) return { kind: "resolved", critical: true, facts: { childPolicy } };

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

  if (explicitPlan) return { kind: "resolved", critical: true, facts: { plan: explicitPlan } };
  if (procedure) return { kind: "resolved", critical: true, facts: { procedure } };

  if (asksForProcedureList(message) && data.procedures.length > 0) {
    return { kind: "resolved", critical: true, facts: { procedureList: data.procedures } };
  }

  const faq = matchingFaq(message, data);
  if (faq) return { kind: "resolved", critical: false, facts: { faq } };
  return { kind: "not_found" };
}
