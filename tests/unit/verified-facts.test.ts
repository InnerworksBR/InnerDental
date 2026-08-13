import { describe, expect, it } from "vitest";
import { assertInsurancePlanCatalog } from "@/domain/knowledge/service";
import { resolveVerifiedFacts } from "@/domain/knowledge/verified-facts";

const knowledge = {
  plans: [
    { id: "unimed", name: "Unimed Dental", instructions: "Leve a carteirinha." },
    { id: "amil", name: "Amil Dental", instructions: null },
  ],
  aliases: [{ alias: "unimed", insurance_plan_id: "unimed" }, { alias: "Amil", insurance_plan_id: "amil" }],
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
    expect(resolveVerifiedFacts("Limpeza tem cobertura?", { ...knowledge, coverage: [] }, { insurancePlanId: "unimed" })).toEqual(expect.objectContaining({ facts: expect.objectContaining({ coverage: { status: "not_found", instructions: null } }) }));
  });

  it("does not invent a generic plan match and rejects duplicate public terms", () => {
    expect(resolveVerifiedFacts("Meu plano é Unimed", {
      ...knowledge,
      plans: [
        { id: "one", name: "Unimed Odonto", instructions: null },
        { id: "two", name: "Unimed Dental", instructions: null },
      ],
      aliases: [],
    })).toEqual({ kind: "not_found" });
    expect(() => assertInsurancePlanCatalog({
      plans: [
        { id: "one", name: "Unimed Odonto", instructions: null },
        { id: "two", name: "Unimed Dental", instructions: null },
      ],
      aliases: [{ alias: "Unimed Dental", insurance_plan_id: "one" }],
    })).toThrow("PLAN_CATALOG_CONFLICT");
  });

  it("fails closed for prices without a structured source", () => {
    expect(resolveVerifiedFacts("Quanto custa a limpeza?", knowledge)).toEqual({ kind: "price_unavailable" });
  });

  it("returns only the matching FAQ as non-critical verified context", () => {
    expect(resolveVerifiedFacts("Qual é a sala?", knowledge)).toEqual({ kind: "resolved", critical: false, facts: { faq: knowledge.faqs[0] } });
  });

  it("gives a categorized payment FAQ priority over a procedure and never borrows the saved plan", () => {
    const paymentKnowledge = {
      ...knowledge,
      procedures: [{ id: "aparelho", name: "Aparelho", description: "Avaliação.", online_booking: false }],
      faqs: [{ category: "pagamento", question: "Quais pagamentos são aceitos?", answer: "Aceitamos cartão de crédito." }],
    };
    expect(resolveVerifiedFacts("Posso pagar a manutenção do aparelho no cartão?", paymentKnowledge, { insurancePlanId: "amil" })).toEqual({
      kind: "resolved",
      critical: false,
      facts: { faq: paymentKnowledge.faqs[0] },
    });
    expect(resolveVerifiedFacts("Posso pagar a manutenção do aparelho no cartão?", { ...paymentKnowledge, faqs: [] }, { insurancePlanId: "amil" })).toEqual({ kind: "not_found" });
  });

  it("does not treat a possessive child reference as an age-policy question", () => {
    const childKnowledge = {
      ...knowledge,
      procedures: [...knowledge.procedures, { id: "child", name: "Crianças abaixo de 8 anos", description: "Não são realizadas consultas em menores de 8 anos.", online_booking: false }],
    };
    expect(resolveVerifiedFacts("O plano do meu filho cobre limpeza?", childKnowledge, { insurancePlanId: "unimed" })).toEqual(expect.objectContaining({
      facts: expect.objectContaining({ procedure: expect.objectContaining({ id: "limpeza" }), coverage: expect.objectContaining({ status: "accepted" }) }),
    }));
    expect(resolveVerifiedFacts("Atende criança também?", childKnowledge)).toEqual(expect.objectContaining({ facts: { childPolicy: childKnowledge.procedures[1] } }));
  });
});
