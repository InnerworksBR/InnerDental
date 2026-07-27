export type KnowledgeData = {
  plans: Array<{ id: string; name: string; instructions: string | null }>;
  aliases: Array<{ alias: string; insurance_plan_id: string }>;
  procedures: Array<{ name: string; description: string | null; online_booking: boolean }>;
  faqs: Array<{ question: string; answer: string }>;
};

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
function containsTerm(message: string, term: string) { const text = ` ${normalize(message)} `; const needle = ` ${normalize(term)} `; return needle.length > 2 && text.includes(needle); }

export function findStructuredAnswer(message: string, data: KnowledgeData): string | null {
  const alias = data.aliases.find((entry) => containsTerm(message, entry.alias));
  const plan = alias ? data.plans.find((entry) => entry.id === alias.insurance_plan_id) : data.plans.find((entry) => containsTerm(message, entry.name));
  if (plan) return plan.instructions ? `Sim, encontramos o plano ${plan.name}. ${plan.instructions}` : `Sim, encontramos o plano ${plan.name} na lista ativa.`;
  const procedure = data.procedures.find((entry) => containsTerm(message, entry.name));
  if (procedure) return `${procedure.name}: ${procedure.description ?? "Consulte a equipe para detalhes."}${procedure.online_booking ? " O agendamento pode ser iniciado pelo portal." : " A equipe precisa orientar o atendimento."}`;
  const faq = data.faqs.find((entry) => normalize(entry.question).split(" ").filter((word) => word.length > 4).some((word) => normalize(message).includes(word)));
  return faq?.answer ?? null;
}
