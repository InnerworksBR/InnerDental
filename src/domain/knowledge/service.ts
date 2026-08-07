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
    .replace(/^eu\s+(?:tenho|uso|utilizo)\s+(?:o\s+plano\s+|o\s+convenio\s+|o\s+)?/, "")
    .replace(/^(?:tenho|uso|utilizo)\s+(?:o\s+plano\s+|o\s+convenio\s+|o\s+)?/, "")
    .replace(/^(?:e|eh)\s+(?:o\s+plano\s+|o\s+convenio\s+|o\s+|a\s+)?/, "")
    .replace(/^(?:pelo\s+plano|pelo\s+convenio|pela|pelo|via|no\s+plano|do\s+plano)\s+/, "")
    .trim();
}

function isParticularAnswer(value: string): boolean {
  const norm = normalize(value);
  return /\b(particular|particulars|privado|sem\s+plano|sem\s+convenio|nao\s+tenho\s+plano|nao\s+tenho\s+convenio|nao\s+tenho|nao\s+possuo|nenhum|nenhuma|sem|pagamento\s+particular|consulta\s+particular)\b/.test(norm);
}

function samePlanTerm(left: string, right: string) {
  return left === right || left.replace(/\s+/g, "") === right.replace(/\s+/g, "");
}

function containsPlanTerm(left: string, right: string) {
  const compactLeft = left.replace(/\s+/g, "");
  const compactRight = right.replace(/\s+/g, "");
  return left.includes(right) || right.includes(left) || compactLeft.includes(compactRight) || compactRight.includes(compactLeft);
}

function sharesBrandWord(left: string, right: string) {
  const leftWords = left.split(/\s+/).filter((w) => w.length > 2 && !["dental", "odonto", "plano", "convenio", "saude", "rede"].includes(w));
  const rightWords = right.split(/\s+/).filter((w) => w.length > 2 && !["dental", "odonto", "plano", "convenio", "saude", "rede"].includes(w));
  return leftWords.some((lw) => rightWords.some((rw) => lw.includes(rw) || rw.includes(lw)));
}

export function triageInsurancePlan(message: string, data: Pick<KnowledgeData, "plans" | "aliases">): InsurancePlanTriageResult {
  if (isParticularAnswer(message)) {
    return { kind: "accepted", plan: { id: "particular", name: "Particular", instructions: null } };
  }

  const answer = planAnswer(message);
  if (isParticularAnswer(answer)) {
    return { kind: "accepted", plan: { id: "particular", name: "Particular", instructions: null } };
  }

  if (answer.length < 3) return { kind: "unsupported" };

  const canonicalCandidates = data.plans.map((plan) => ({ term: normalize(plan.name), plan }));
  const canonicalExact = canonicalCandidates.find((candidate) => samePlanTerm(candidate.term, answer));
  if (canonicalExact) return { kind: "accepted", plan: canonicalExact.plan };

  const canonicalPartial = canonicalCandidates.filter((candidate) => containsPlanTerm(candidate.term, answer) || sharesBrandWord(candidate.term, answer));
  const canonicalPlanIds = [...new Set(canonicalPartial.map((candidate) => candidate.plan.id))];
  if (canonicalPlanIds.length >= 1) return { kind: "accepted", plan: canonicalPartial[0].plan };

  const aliasCandidates = data.aliases.flatMap((alias) => {
    const plan = data.plans.find((entry) => entry.id === alias.insurance_plan_id);
    return plan ? [{ term: normalize(alias.alias), plan }] : [];
  });
  const aliasExact = aliasCandidates.find((candidate) => samePlanTerm(candidate.term, answer));
  if (aliasExact) return { kind: "accepted", plan: aliasExact.plan };

  const aliasPartial = aliasCandidates.filter((candidate) => containsPlanTerm(candidate.term, answer) || sharesBrandWord(candidate.term, answer));
  const aliasPlanIds = [...new Set(aliasPartial.map((candidate) => candidate.plan.id))];
  if (aliasPlanIds.length >= 1) return { kind: "accepted", plan: aliasPartial[0].plan };

  if (/\bcaixa\b/.test(answer)) return { kind: "caixa" };
  if (["dental", "odonto", "plano", "convenio", "saude"].includes(answer)) return { kind: "unsupported" };

  return { kind: "unsupported" };
}

export function findRequestedProcedure(message: string, data: Pick<KnowledgeData, "procedures">): KnowledgeData["procedures"][number] | null {
  return data.procedures.find((entry) => containsTerm(message, entry.name)) ?? null;
}

export function findStructuredAnswer(message: string, data: KnowledgeData): string | null {
  const normalizedMessage = normalize(message);

  if (/\b(particular|particulars|privado|sem convenio|sem plano)\b/.test(normalizedMessage)) {
    return "Sim, realizamos atendimentos particulares. Caso você tenha um convênio, também consultamos os planos cadastrados na clínica.";
  }

  const alias = data.aliases.find((entry) => containsTerm(message, entry.alias) || sharesBrandWord(normalizedMessage, normalize(entry.alias)));
  const plan = alias
    ? data.plans.find((entry) => entry.id === alias.insurance_plan_id)
    : data.plans.find((entry) => containsTerm(message, entry.name) || sharesBrandWord(normalizedMessage, normalize(entry.name)));
  if (plan) return plan.instructions ? `Sim, encontramos o plano ${plan.name}. ${plan.instructions}` : `Sim, encontramos o plano ${plan.name} na lista ativa.`;

  const asksForPlanList = (/\b(quais|lista|todos|planos|convenios)\b/.test(normalizedMessage)
    && /\b(plano|planos|convenio|convenios)\b/.test(normalizedMessage))
    || (/\b(aceita|aceitam|aceito|aceitos|atende|atendem|trabalha|trabalham)\b/.test(normalizedMessage)
    && /\b(plano|planos|convenio|convenios)\b/.test(normalizedMessage));
  if (asksForPlanList && data.plans.length > 0) {
    return `Os planos ativos são: ${data.plans.map((entry) => entry.name).join(", ")}. Também realizamos atendimentos particulares.`;
  }

  const procedure = findRequestedProcedure(message, data);
  if (procedure) return `${procedure.name}: ${procedure.description ?? "Consulte a equipe para detalhes."}${procedure.online_booking ? " O agendamento pode ser iniciado pelo portal." : " A equipe precisa orientar o atendimento."}`;
  const childProcedure = data.procedures.find((entry) => ["criancas", "odontopediatria", "pediatria"].includes(normalize(entry.name)));
  if (childProcedure && /\b(crianca|criancas|filho|filha|menor|idade|anos)\b/.test(normalizedMessage)) return `${childProcedure.name}: ${childProcedure.description ?? "Consulte a equipe para detalhes."}`;
  const asksForProcedureList = /\b(quais|lista|todos)\b/.test(normalizedMessage) && /\b(procedimentos|tratamentos|servicos)\b/.test(normalizedMessage);
  if (asksForProcedureList && data.procedures.length > 0) return `Os procedimentos cadastrados são: ${data.procedures.map((entry) => entry.name).join(", ")}.`;
  const faq = data.faqs.find((entry) => normalize(entry.question).split(" ").filter((word) => word.length > 4).some((word) => normalize(message).includes(word)));
  return faq?.answer ?? null;
}
