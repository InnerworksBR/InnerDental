export type KnowledgeData = {
  plans: Array<{ id: string; name: string; instructions: string | null }>;
  aliases: Array<{ alias: string; insurance_plan_id: string }>;
  procedures: Array<{ name: string; description: string | null; online_booking: boolean }>;
  faqs: Array<{ question: string; answer: string }>;
};

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
function containsTerm(message: string, term: string) { const text = ` ${normalize(message)} `; const needle = ` ${normalize(term)} `; return needle.length > 2 && text.includes(needle); }

export type InsurancePlanTriageResult =
  | { kind: "accepted"; plan: KnowledgeData["plans"][number] }
  | { kind: "caixa" }
  | { kind: "unsupported" };

function planAnswer(value: string) {
  return normalize(value)
    .replace(/^(?:o\s+)?meu\s+(?:plano|convenio)\s+(?:e|eh)\s+/, "")
    .replace(/^(?:o\s+)?(?:plano|convenio)\s+(?:e|eh)\s+/, "")
    .replace(/^eu\s+tenho\s+(?:o\s+plano\s+)?/, "")
    .replace(/^tenho\s+(?:o\s+plano\s+)?/, "")
    .trim();
}

function samePlanTerm(left: string, right: string) {
  return left === right || left.replace(/\s+/g, "") === right.replace(/\s+/g, "");
}

function containsPlanTerm(left: string, right: string) {
  const compactLeft = left.replace(/\s+/g, "");
  const compactRight = right.replace(/\s+/g, "");
  return left.includes(right) || right.includes(left) || compactLeft.includes(compactRight) || compactRight.includes(compactLeft);
}

export function triageInsurancePlan(message: string, data: Pick<KnowledgeData, "plans" | "aliases">): InsurancePlanTriageResult {
  const answer = planAnswer(message);
  if (/\bcaixa\b/.test(answer)) return { kind: "caixa" };
  if (answer.length < 3) return { kind: "unsupported" };
  if (["dental", "odonto", "plano", "convenio", "saude"].includes(answer)) return { kind: "unsupported" };

  const canonicalCandidates = data.plans.map((plan) => ({ term: normalize(plan.name), plan }));
  const canonicalExact = canonicalCandidates.find((candidate) => samePlanTerm(candidate.term, answer));
  if (canonicalExact) return { kind: "accepted", plan: canonicalExact.plan };

  const canonicalPartial = canonicalCandidates.filter((candidate) => containsPlanTerm(candidate.term, answer));
  const canonicalPlanIds = [...new Set(canonicalPartial.map((candidate) => candidate.plan.id))];
  if (canonicalPlanIds.length === 1) return { kind: "accepted", plan: canonicalPartial[0].plan };
  if (canonicalPlanIds.length > 1) return { kind: "unsupported" };

  const aliasCandidates = data.aliases.flatMap((alias) => {
    const plan = data.plans.find((entry) => entry.id === alias.insurance_plan_id);
    return plan ? [{ term: normalize(alias.alias), plan }] : [];
  });
  const aliasExact = aliasCandidates.find((candidate) => samePlanTerm(candidate.term, answer));
  if (aliasExact) return { kind: "accepted", plan: aliasExact.plan };

  const aliasPartial = aliasCandidates.filter((candidate) => containsPlanTerm(candidate.term, answer));
  const aliasPlanIds = [...new Set(aliasPartial.map((candidate) => candidate.plan.id))];
  if (aliasPlanIds.length !== 1) return { kind: "unsupported" };
  return { kind: "accepted", plan: aliasPartial[0].plan };
}

export function findRequestedProcedure(message: string, data: Pick<KnowledgeData, "procedures">): KnowledgeData["procedures"][number] | null {
  return data.procedures.find((entry) => containsTerm(message, entry.name)) ?? null;
}

export function findStructuredAnswer(message: string, data: KnowledgeData): string | null {
  const normalizedMessage = normalize(message);
  const alias = data.aliases.find((entry) => containsTerm(message, entry.alias));
  const plan = alias ? data.plans.find((entry) => entry.id === alias.insurance_plan_id) : data.plans.find((entry) => containsTerm(message, entry.name));
  if (plan) return plan.instructions ? `Sim, encontramos o plano ${plan.name}. ${plan.instructions}` : `Sim, encontramos o plano ${plan.name} na lista ativa.`;
  const asksForPlanList = /\b(quais|lista|todos|planos|convenios)\b/.test(normalizedMessage)
    && /\b(plano|planos|convenio|convenios)\b/.test(normalizedMessage)
    && /\b(quais|lista|todos|aceita|aceitam|aceito|aceitos|atende|atendem)\b/.test(normalizedMessage);
  if (asksForPlanList && data.plans.length > 0) return `Os planos ativos são: ${data.plans.map((entry) => entry.name).join(", ")}.`;
  const procedure = findRequestedProcedure(message, data);
  if (procedure) return `${procedure.name}: ${procedure.description ?? "Consulte a equipe para detalhes."}${procedure.online_booking ? " O agendamento pode ser iniciado pelo portal." : " A equipe precisa orientar o atendimento."}`;
  const childProcedure = data.procedures.find((entry) => ["criancas", "odontopediatria", "pediatria"].includes(normalize(entry.name)));
  if (childProcedure && /\b(crianca|criancas|filho|filha|menor|idade|anos)\b/.test(normalizedMessage)) return `${childProcedure.name}: ${childProcedure.description ?? "Consulte a equipe para detalhes."}`;
  const asksForProcedureList = /\b(quais|lista|todos)\b/.test(normalizedMessage) && /\b(procedimentos|tratamentos|servicos)\b/.test(normalizedMessage);
  if (asksForProcedureList && data.procedures.length > 0) return `Os procedimentos cadastrados são: ${data.procedures.map((entry) => entry.name).join(", ")}.`;
  const faq = data.faqs.find((entry) => normalize(entry.question).split(" ").filter((word) => word.length > 4).some((word) => normalize(message).includes(word)));
  return faq?.answer ?? null;
}
