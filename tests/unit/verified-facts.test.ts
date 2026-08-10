import { describe, expect, it } from "vitest";
import { resolveVerifiedFacts } from "@/domain/knowledge/verified-facts";

const knowledge = {
  plans: [
    { id: "unimed", name: "Unimed Dental", instructions: "Leve a carteirinha." },
    { id: "amil", name: "Amil Dental", instructions: null },
  ],
  aliases: [{ alias: "unimed", insurance_plan_id: "unimed" }],
  procedures: [{ id: "limpeza", name: "Limpeza", description: "Avaliação inicial.", online_booking: true }],
  coverage: [
    { procedure_id: "limpeza", insurance_plan_id: "unimed", accepted: true, instructions: "Confirmar elegibilidade do plano." },
    { procedure_id: "limpeza", insurance_plan_id: "amil", accepted: false, instructions: "Somente particular." },
  ],
  faqs: [{ question: "Onde fica a clínica?", answer: "Rua Exemplo, sala 12." }],
};

describe("verified facts", () => {
  it("returns the exact positive coverage registered for a plan and procedure", () => {
    expect(resolveVerifiedFacts("Vocês atendem Unimed para limpeza?", knowledge)).toEqual({
      kind: "resolved",
      critical: true,
      facts: expect.objectContaining({
        plan: expect.objectContaining({ id: "unimed" }),
        procedure: expect.objectContaining({ id: "limpeza" }),
        coverage: { status: "accepted", instructions: "Confirmar elegibilidade do plano." },
      }),
    });
  });

  it("keeps a negative or missing coverage distinct from a positive one", () => {
    expect(resolveVerifiedFacts("Amil cobre limpeza?", knowledge)).toEqual(expect.objectContaining({ facts: expect.objectContaining({ coverage: { status: "not_covered", instructions: "Somente particular." } }) }));
    expect(resolveVerifiedFacts("Limpeza", { ...knowledge, coverage: [] }, { insurancePlanId: "unimed" })).toEqual(expect.objectContaining({ facts: expect.objectContaining({ coverage: { status: "not_found", instructions: null } }) }));
  });

  it("fails closed for ambiguous plans and prices without a structured source", () => {
    expect(resolveVerifiedFacts("Meu plano é Unimed", {
      ...knowledge,
      plans: [
        { id: "one", name: "Unimed Odonto", instructions: null },
        { id: "two", name: "Unimed Dental", instructions: null },
      ],
      aliases: [],
    })).toEqual({ kind: "ambiguous_plan" });
    expect(resolveVerifiedFacts("Quanto custa a limpeza?", knowledge)).toEqual({ kind: "price_unavailable" });
  });

  it("returns only the matching FAQ as non-critical verified context", () => {
    expect(resolveVerifiedFacts("Qual é a sala?", knowledge)).toEqual({ kind: "resolved", critical: false, facts: { faq: knowledge.faqs[0] } });
  });
});
