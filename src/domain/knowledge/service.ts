export type KnowledgeData = {
  plans: Array<{ id: string; name: string; instructions: string | null }>;
  aliases: Array<{ alias: string; insurance_plan_id: string }>;
  procedures: Array<{ id?: string; name: string; description: string | null; online_booking: boolean }>;
  coverage?: Array<{ procedure_id: string; insurance_plan_id: string; accepted: boolean; instructions: string | null }>;
  faqs: Array<{ category?: string; question: string; answer: string }>;
};

export function normalizeKnowledgeTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsExactTerm(message: string, term: string) {
  const text = normalizeKnowledgeTerm(message);
  const needle = normalizeKnowledgeTerm(term);
  if (needle.length <= 2) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

export type InsurancePlanTriageResult =
  | { kind: "accepted"; plan: KnowledgeData["plans"][number] }
  | { kind: "caixa" }
  | { kind: "ambiguous" }
  | { kind: "unsupported" };

type PlanTerm = { term: string; plan: KnowledgeData["plans"][number] };

/**
 * Public, patient-facing spellings of each plan. `containsExactTerm` already
 * requires a word boundary on both sides, so the head (first token) of every
 * multi-word name is a safe prefix matcher: "Bradesco" still matches
 * "Bradesco Dental" but never "Bradescolar" or "BradescoDental" without a
 * space. Single-word plans (e.g. "Particular") keep only their full term so
 * "particular" never matches the unrelated word "particularidade".
 */
function planTermVariants(plan: KnowledgeData["plans"][number]): string[] {
  const variants: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    if (value.length === 0 || seen.has(value)) return;
    seen.add(value);
    variants.push(value);
  };
  const full = normalizeKnowledgeTerm(plan.name);
  push(full);
  if (full.includes(" ")) {
    const head = full.split(" ", 1)[0]!;
    if (head.length >= 4) push(head);
  }
  return variants;
}

function publicPlanTerms(data: Pick<KnowledgeData, "plans" | "aliases">): PlanTerm[] {
  const byId = new Map(data.plans.map((plan) => [plan.id, plan]));
  const terms: PlanTerm[] = [];
  for (const plan of data.plans) for (const term of planTermVariants(plan)) terms.push({ term, plan });
  for (const alias of data.aliases) {
    const plan = byId.get(alias.insurance_plan_id);
    if (!plan) continue;
    const aliasName = normalizeKnowledgeTerm(alias.alias);
    if (aliasName) terms.push({ term: aliasName, plan });
    if (aliasName.includes(" ")) {
      const head = aliasName.split(" ", 1)[0]!;
      if (head.length >= 4) terms.push({ term: head, plan });
    }
  }
  return terms;
}

/**
 * The database prevents these conflicts, but the worker validates the catalog too so a
 * partially migrated or manually corrupted catalog fails closed before it can answer.
 */
export function insurancePlanCatalogConflicts(data: Pick<KnowledgeData, "plans" | "aliases">) {
  const owners = new Map<string, Set<string>>();
  for (const { term, plan } of publicPlanTerms(data)) {
    const ids = owners.get(term) ?? new Set<string>();
    ids.add(plan.id);
    owners.set(term, ids);
  }
  return [...owners.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([term]) => term);
}

export function assertInsurancePlanCatalog(data: Pick<KnowledgeData, "plans" | "aliases">) {
  const conflicts = insurancePlanCatalogConflicts(data);
  if (conflicts.length > 0) throw new Error("PLAN_CATALOG_CONFLICT");
}

function planAnswer(value: string) {
  return normalizeKnowledgeTerm(value)
    .replace(/^(?:o\s+)?meu\s+(?:plano|convenio)\s+(?:e|eh)\s+/, "")
    .replace(/^(?:o\s+)?(?:plano|convenio)\s+(?:e|eh)\s+/, "")
    .replace(/^eu\s+(?:tenho|uso|utilizo)\s+(?:o\s+plano\s+|o\s+convenio\s+|o\s+)?/, "")
    .replace(/^(?:tenho|uso|utilizo)\s+(?:o\s+plano\s+|o\s+convenio\s+|o\s+)?/, "")
    .replace(/^(?:e|eh)\s+(?:o\s+plano\s+|o\s+convenio\s+|o\s+|a\s+)?/, "")
    .replace(/^(?:pelo\s+plano|pelo\s+convenio|pela|pelo|via|no\s+plano|do\s+plano)\s+/, "")
    .trim();
}

function isParticularAnswer(value: string): boolean {
  const term = normalizeKnowledgeTerm(value);
  return term === "particular"
    || term === "privado"
    || /^(?:atendimento|consulta|pagamento) particular$/.test(term)
    || /^(?:sem|nao tenho|nao possuo) (?:plano|convenio)$/.test(term);
}

function particularPlan(data: Pick<KnowledgeData, "plans">) {
  return data.plans.find(isParticularPlan);
}

export function isParticularPlan(plan: Pick<KnowledgeData["plans"][number], "name">) {
  return normalizeKnowledgeTerm(plan.name) === "particular";
}

function planTermConflicts(data: Pick<KnowledgeData, "plans" | "aliases">): Set<string> {
  const owners = new Map<string, Set<string>>();
  for (const { term, plan } of publicPlanTerms(data)) {
    const ids = owners.get(term) ?? new Set<string>();
    ids.add(plan.id);
    owners.set(term, ids);
  }
  return new Set([...owners.entries()].filter(([, ids]) => ids.size > 1).map(([term]) => term));
}

export function triageInsurancePlan(message: string, data: Pick<KnowledgeData, "plans" | "aliases">): InsurancePlanTriageResult {
  const conflicts = planTermConflicts(data);
  if (isParticularAnswer(message) || isParticularAnswer(planAnswer(message))) {
    // Particular is a first-class plan record. Returning a synthetic identifier
    // would let the worker send a link before it can persist valid patient state.
    const plan = particularPlan(data);
    return plan ? { kind: "accepted", plan } : { kind: "unsupported" };
  }

  // Conflicting public terms (e.g. two active plans that both own the head
  // "Unimed") are catalog bugs the migration prevents, but if a partially
  // migrated dataset reaches the worker, we drop the ambiguous term here
  // instead of failing every patient message. The dedicated assert still
  // throws for hot paths that must fail closed.
  const terms = conflicts.size > 0
    ? publicPlanTerms(data).filter(({ term }) => !conflicts.has(term))
    : publicPlanTerms(data);

  const answer = planAnswer(message);
  const matchingPlans = [...new Map(
    terms
      .filter(({ term }) => term === answer || containsExactTerm(message, term))
      .map(({ plan }) => [plan.id, plan]),
  ).values()];
  if (matchingPlans.length === 1) return { kind: "accepted", plan: matchingPlans[0] };
  if (matchingPlans.length > 1) return { kind: "ambiguous" };
  return { kind: "unsupported" };
}

/**
 * A pending plan prompt may be resumed only by a direct plan response. A new
 * question can name a valid plan ("Vocês aceitam Bradesco Dental?") without
 * being an answer to that prompt, so it must retain control of the pipeline.
 */
export function isExplicitInsurancePlanAnswer(message: string, data: Pick<KnowledgeData, "plans" | "aliases">) {
  const result = triageInsurancePlan(message, data);
  if (result.kind !== "accepted") return false;
  if (/[?¿]/.test(message)) return false;

  const value = normalizeKnowledgeTerm(message);
  if (/^(?:voce|voces|a clinica|clinica|eles|ela)\s+(?:aceita|aceitam|atende|atendem|trabalha|trabalham|cobre|cobrem|tem|possui)\b/.test(value)) return false;
  if (/^(?:qual|quais|como|onde|quando|porque|por que|sera que|gostaria de saber)\b/.test(value)) return false;

  const answer = planAnswer(message);
  if (isParticularAnswer(message) || isParticularAnswer(answer)) return true;
  // `publicPlanTerms` now exposes both the full term and the first-word head
  // (≥4 letters) of every multi-word plan or alias. Accept the answer when the
  // normalized reply matches any registered public spelling for the matched
  // plan, so "Bradesco" or "OdontoPrev" are valid replies without forcing the
  // patient to retype the full alias registered on the back office.
  const allowedForPlan = new Set(publicPlanTerms(data).filter(({ plan }) => plan.id === result.plan.id).map(({ term }) => term));
  return allowedForPlan.has(answer);
}

export function findRequestedProcedure(message: string, data: Pick<KnowledgeData, "procedures">): KnowledgeData["procedures"][number] | null {
  return data.procedures.find((entry) => containsExactTerm(message, entry.name)) ?? null;
}

export function findChildCarePolicy(message: string, data: Pick<KnowledgeData, "procedures">) {
  const normalizedMessage = normalizeKnowledgeTerm(message);
  const mentionsChildOrAge = /\b(crianca|criancas|filho|filha|menor|idade|anos)\b/.test(normalizedMessage);
  const asksAboutAttendance = /\b(atende|atendem|aceita|aceitam|consulta|consultar|consultas|pode|podem)\b/.test(normalizedMessage);
  const asksAboutAgePolicy = /\b(idade|anos?|menor|abaixo|acima)\b/.test(normalizedMessage)
    && /\b(qual|tem|existe|limite|minim[ao]|maxim[ao]|ate|a partir|aceita|atende|pode)\b/.test(normalizedMessage);
  // A possessive alone (for example, "o plano do meu filho") is not a
  // child-care policy question and must remain eligible for plan routing.
  if (!mentionsChildOrAge || (!asksAboutAttendance && !asksAboutAgePolicy)) return null;
  return data.procedures.find((entry) => /\b(crianca|criancas|odontopediatria|pediatria)\b/.test(normalizeKnowledgeTerm(entry.name))) ?? null;
}

export function findStructuredAnswer(message: string, data: KnowledgeData): string | null {
  const planResult = triageInsurancePlan(message, data);
  if (planResult.kind === "accepted" && !isParticularPlan(planResult.plan)) {
    const plan = planResult.plan;
    return plan.instructions ? `Sim, encontramos o plano ${plan.name}. ${plan.instructions}` : `Sim, encontramos o plano ${plan.name} na lista ativa.`;
  }

  const normalizedMessage = normalizeKnowledgeTerm(message);
  const asksForPlanList = /\b(plano|planos|convenio|convenios)\b/.test(normalizedMessage)
    && /\b(quais|lista|todos|aceita|aceitam|aceito|aceitos|atende|atendem|trabalha|trabalham)\b/.test(normalizedMessage);
  if (asksForPlanList && data.plans.length > 0) {
    return `Os planos ativos são: ${data.plans.map((entry) => entry.name).join(", ")}. Também realizamos atendimentos particulares.`;
  }

  const childPolicy = findChildCarePolicy(message, data);
  if (childPolicy) return `${childPolicy.name}: ${childPolicy.description ?? "Consulte a equipe para detalhes."}`;

  const procedure = findRequestedProcedure(message, data);
  if (procedure) return `${procedure.name}: ${procedure.description ?? "Consulte a equipe para detalhes."}${procedure.online_booking ? " O agendamento pode ser iniciado pelo portal." : " A equipe precisa orientar o atendimento."}`;
  return null;
}
