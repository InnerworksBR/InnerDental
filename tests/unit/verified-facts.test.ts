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

  it("matches a plan name when it appears at the end of the sentence before punctuation", () => {
    // The print "Mas não atende SulAmérica?" used to fall through to the
    // generic knowledge fallback because `containsExactTerm` required spaces
    // on both sides of the needle; the word-boundary regex now handles it.
    // We exercise Unimed/Amil here because the base fixture ships without
    // SulAmérica; the E2E test in `whatsapp-routing-definitivo.test.ts`
    // reproduces the original SulAmérica and Bradesco screenshots against
    // a fixture that includes those plans.
    expect(resolveVerifiedFacts("Mas não atende Unimed?", knowledge)).toEqual(expect.objectContaining({
      kind: "resolved",
      critical: true,
      facts: expect.objectContaining({ plan: expect.objectContaining({ id: "unimed" }) }),
    }));
    expect(resolveVerifiedFacts("Vocês aceitam Amil?", knowledge)).toEqual(expect.objectContaining({
      facts: expect.objectContaining({ plan: expect.objectContaining({ id: "amil" }) }),
    }));
    expect(resolveVerifiedFacts("Amil.", knowledge)).toEqual(expect.objectContaining({
      facts: expect.objectContaining({ plan: expect.objectContaining({ id: "amil" }) }),
    }));
    expect(resolveVerifiedFacts("Unimed, vocês atendem?", knowledge)).toEqual(expect.objectContaining({
      facts: expect.objectContaining({ plan: expect.objectContaining({ id: "unimed" }) }),
    }));
    // "Aceito Convênio Amil?" carries both "convenio" and "aceita" so it
    // matches `asksForPlanList` and returns the full plan list — exactly the
    // same upgrade-from-fallback behaviour as the Bradesco screenshot in the
    // whatsapp-routing-definitivo E2E test. Crucially, it is no longer the
    // generic `not_found` fallback.
    expect(resolveVerifiedFacts("Aceito Convênio Amil?", knowledge)).toEqual(expect.objectContaining({
      kind: "resolved",
      critical: true,
      facts: expect.objectContaining({ planList: expect.arrayContaining([expect.objectContaining({ id: "amil" })]) }),
    }));
  });

  it("does not match plan names as substrings of unrelated words", () => {
    // The word-boundary regex must keep the original safety: "particular"
    // does not match "particularidade" and "unimed" does not match
    // "desumimed" or "unimedacare".
    expect(resolveVerifiedFacts("O caso tem uma particularidade clínica específica", knowledge)).toEqual({ kind: "not_found" });
    expect(resolveVerifiedFacts("desumimed seria possível?", knowledge)).toEqual({ kind: "not_found" });
  });
});
