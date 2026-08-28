/**
 * Testes do novo fluxo de atendimento.
 *
 * Cada cenário simula uma conversa real e valida:
 *   - Parser extrai a intenção correta
 *   - Decisor toma a decisão certa
 *   - Operação pro worker é a esperada
 *
 * Sem rede: parser e OpenAI são mockados. Decisor é puro e testado direto.
 */

import { describe, it, expect } from "vitest";
import { decide, resolveHintsAgainstKnowledge, EMPTY_QUALIFICATION } from "../../src/domain/messaging/decisor.ts";
import type { ParserOutput } from "../../src/domain/messaging/intent-parser.ts";
import type { KnowledgeData } from "../../src/domain/knowledge/service.ts";

// ============================================================
// Fixture: knowledge de uma clínica dental real
// ============================================================

const fakeKnowledge: KnowledgeData = {
  plans: [
    { id: "p1", name: "Unimed", active: true, instructions: null },
    { id: "p2", name: "Bradesco Saúde", active: true, instructions: "Apenas consultas" },
    { id: "p3", name: "Amil", active: true, instructions: null },
    { id: "p4", name: "Caixa Econômica", active: false, instructions: null },
  ],
  aliases: [],
  procedures: [
    { id: "pr1", name: "Limpeza", description: "Profilaxia completa", active: true, online_booking: true },
    { id: "pr2", name: "Canal", description: "Tratamento endodôntico", active: true, online_booking: false },
    { id: "pr3", name: "Clareamento", description: "Clareamento dental", active: true, online_booking: true },
    { id: "pr4", name: "Avaliação", description: "Consulta inicial", active: true, online_booking: true },
  ],
  coverage: [],
  faqs: [
    {
      id: "f1",
      question: "Qual o endereço?",
      answer: "Rua das Flores, 123 — Centro. Próximo ao metrô Sé.",
      category: "localizacao",
      active: true,
    },
    {
      id: "f2",
      question: "Qual o horário?",
      answer: "Segunda a sexta, das 9h às 18h. Sábado das 9h às 13h.",
      category: "horario",
      active: true,
    },
  ],
};

function parserOutput(overrides: Partial<ParserOutput>): ParserOutput {
  return {
    intent: "saudacao",
    sentiment: "ok",
    confidence: 0.9,
    slots: {},
    needs_human: false,
    ...overrides,
  };
}

// ============================================================
// Cenário 1: Saudação inicial
// ============================================================

describe("Cenário 1: Saudação", () => {
  it('"oi, boa tarde" → envia menu de opções', () => {
    const parser: ParserOutput = parserOutput({ intent: "saudacao", confidence: 0.95 });
    const result = decide({
      parser,
      message: "oi, boa tarde",
      qualification: EMPTY_QUALIFICATION,
      knowledge: fakeKnowledge,
    });
    expect(result.type).toBe("send_questions_menu");
    expect(result.reason).toContain("menu");
  });
});

// ============================================================
// Cenário 2: FAQ sobre endereço
// ============================================================

describe("Cenário 2: FAQ sobre endereço", () => {
  it('"qual o endereço?" → responde com FAQ verificada', () => {
    const parser: ParserOutput = parserOutput({ intent: "faq", confidence: 0.93 });
    const result = decide({
      parser,
      message: "qual o endereço?",
      qualification: EMPTY_QUALIFICATION,
      knowledge: fakeKnowledge,
    });
    expect(result.type).toBe("send_interactive");
    if (result.type === "send_interactive") {
      expect(result.message.description).toContain("Rua das Flores");
    }
    expect(result.reason).toContain("FAQ encontrada");
  });
});

// ============================================================
// Cenário 3: Plano aceito
// ============================================================

describe("Cenário 3: Pergunta sobre plano aceito", () => {
  it('"vocês aceitam Unimed?" → confirma', () => {
    const parser: ParserOutput = parserOutput({
      intent: "plano",
      confidence: 0.92,
      slots: { plano_hint: "Unimed" },
    });
    const result = decide({
      parser,
      message: "vocês aceitam Unimed?",
      qualification: EMPTY_QUALIFICATION,
      knowledge: fakeKnowledge,
    });
    expect(result.type).toBe("send_interactive");
    if (result.type === "send_interactive") {
      expect(result.message.description).toContain("Unimed");
    }
  });

  it('"vocês aceitam Caixa?" → rejeita', () => {
    const parser: ParserOutput = parserOutput({
      intent: "plano",
      confidence: 0.92,
      slots: { plano_hint: "Caixa" },
    });
    const result = decide({
      parser,
      message: "vocês aceitam Caixa?",
      qualification: EMPTY_QUALIFICATION,
      knowledge: fakeKnowledge,
    });
    // Caixa Econômica é inactive → o triage rejeita → texto não confirma
    expect(["send_text", "send_interactive"]).toContain(result.type);
    if (result.type === "send_interactive") {
      expect(result.message.description.toLowerCase()).not.toContain("sim, atendemos");
    }
  });
});

// ============================================================
// Cenário 4: Procedimento
// ============================================================

describe("Cenário 4: Pergunta sobre procedimento", () => {
  it('"faz clareamento?" → responde', () => {
    const parser: ParserOutput = parserOutput({
      intent: "procedimento",
      confidence: 0.9,
      slots: { procedimento_hint: "clareamento" },
    });
    const result = decide({
      parser,
      message: "faz clareamento?",
      qualification: EMPTY_QUALIFICATION,
      knowledge: fakeKnowledge,
    });
    expect(result.type).toBe("send_interactive");
    if (result.type === "send_interactive") {
      expect(result.message.description).toContain("Clareamento");
    }
  });

  it('"faz implante?" → mostra lista (não achou)', () => {
    const parser: ParserOutput = parserOutput({
      intent: "procedimento",
      confidence: 0.85,
      slots: { procedimento_hint: "implante" },
    });
    const result = decide({
      parser,
      message: "faz implante?",
      qualification: EMPTY_QUALIFICATION,
      knowledge: fakeKnowledge,
    });
    expect(result.type).toBe("send_interactive");
    if (result.type === "send_interactive") {
      // Mostra lista de procedimentos ativos
      expect(result.message.description).toMatch(/Limpeza|Canal|Clareamento|Avaliação/);
    }
  });
});

// ============================================================
// Cenário 5: Agendamento — qualificação completa
// ============================================================

describe("Cenário 5: Agendamento — qualificação estruturada", () => {
  it('começa pedindo nome', () => {
    const parser: ParserOutput = parserOutput({ intent: "agendar", confidence: 0.94 });
    const result = decide({
      parser,
      message: "quero marcar uma limpeza",
      qualification: EMPTY_QUALIFICATION,
      knowledge: fakeKnowledge,
    });
    expect(result.type).toBe("ask_qualification_slot");
    if (result.type === "ask_qualification_slot") {
      expect(result.slot).toBe("nome");
    }
  });

  it("paciente diz nome → pede procedimento", () => {
    const parser: ParserOutput = parserOutput({
      intent: "agendar",
      confidence: 0.94,
      slots: { nome: "Maria Silva" },
    });
    const state: typeof EMPTY_QUALIFICATION = {
      ...EMPTY_QUALIFICATION,
      awaiting_slot: "nome",
    };
    const result = decide({
      parser,
      message: "Maria Silva",
      qualification: state,
      knowledge: fakeKnowledge,
    });
    // Após merge, nome será aplicado. Próximo slot é procedimento.
    expect(result.type).toBe("ask_qualification_slot");
    if (result.type === "ask_qualification_slot") {
      expect(result.slot).toBe("procedimento");
    }
  });

  it("qualificação completa → qualificação_complete", () => {
    const parser: ParserOutput = parserOutput({
      intent: "agendar",
      confidence: 0.95,
      slots: {},
    });
    const state: typeof EMPTY_QUALIFICATION = {
      awaiting_slot: "para_quem",
      nome: "João Santos",
      procedimento_id: "pr1",
      procedimento_nome: "Limpeza",
      plano_id: "p1",
      plano_nome: "Unimed",
      para_outra_pessoa: false, // findMissingSlot exige que esteja definido
    };
    const result = decide({
      parser,
      message: "pra mim mesmo",
      qualification: state,
      knowledge: fakeKnowledge,
    });
    expect(result.type).toBe("qualification_complete");
    if (result.type === "qualification_complete") {
      expect(result.summary.nome).toBe("João Santos");
      expect(result.summary.procedimento).toBe("Limpeza");
      expect(result.summary.plano).toBe("Unimed");
    }
  });
});

// ============================================================
// Cenário 6: Paciente irritado
// ============================================================

describe("Cenário 6: Paciente irritado", () => {
  it('"vocês são péssimos" → escala imediatamente', () => {
    const parser: ParserOutput = parserOutput({
      intent: "humano",
      sentiment: "irritado",
      confidence: 0.92,
      needs_human: true,
      reason: "reclamação",
    });
    const result = decide({
      parser,
      message: "vocês são péssimos, nunca mais volto",
      qualification: EMPTY_QUALIFICATION,
      knowledge: fakeKnowledge,
    });
    expect(result.type).toBe("escalate_to_human");
    if (result.type === "escalate_to_human") {
      expect(result.reason).toContain("irritado");
    }
  });
});

// ============================================================
// Cenário 7: Paciente pediu humano explicitamente
// ============================================================

describe("Cenário 7: Pedido explícito de humano", () => {
  it('"quero falar com alguém" → escala', () => {
    const parser: ParserOutput = parserOutput({
      intent: "humano",
      confidence: 0.95,
      needs_human: true,
    });
    const result = decide({
      parser,
      message: "quero falar com alguém",
      qualification: EMPTY_QUALIFICATION,
      knowledge: fakeKnowledge,
    });
    expect(result.type).toBe("escalate_to_human");
  });
});

// ============================================================
// Cenário 8: Urgência mencionada
// ============================================================

describe("Cenário 8: Urgência médica", () => {
  it('"tô com dor" → marca como agendar + escalate', () => {
    const parser: ParserOutput = parserOutput({
      intent: "agendar",
      sentiment: "impaciente",
      confidence: 0.88,
      needs_human: true,
      reason: "mencionou dor",
    });
    const result = decide({
      parser,
      message: "tô com muita dor, preciso urgente",
      qualification: EMPTY_QUALIFICATION,
      knowledge: fakeKnowledge,
    });
    expect(result.type).toBe("escalate_to_human");
    if (result.type === "escalate_to_human") {
      expect(result.reason).toContain("urgência");
    }
  });
});

// ============================================================
// Cenário 9: ResolvedHints — plano aceito
// ============================================================

describe("Cenário 9: Resolução de hints contra knowledge", () => {
  it("plano_hint Unimed → plano_id preenchido", () => {
    const result = resolveHintsAgainstKnowledge(
      { ...EMPTY_QUALIFICATION, plano_nome: "Unimed" },
      fakeKnowledge,
    );
    expect(result.plano_id).toBe("p1");
    expect(result.plano_nome).toBe("Unimed");
  });

  it("procedimento_hint Limpeza → procedimento_id preenchido", () => {
    const result = resolveHintsAgainstKnowledge(
      { ...EMPTY_QUALIFICATION, procedimento_nome: "limpeza" },
      fakeKnowledge,
    );
    expect(result.procedimento_id).toBe("pr1");
    expect(result.procedimento_nome).toBe("Limpeza");
  });

  it("plano_hint inexistente → fica sem id (vai escalar)", () => {
    const result = resolveHintsAgainstKnowledge(
      { ...EMPTY_QUALIFICATION, plano_nome: "Hapvida" },
      fakeKnowledge,
    );
    expect(result.plano_id).toBeUndefined();
  });
});

// ============================================================
// Cenário 10: Paciente muda de assunto no meio
// ============================================================

describe("Cenário 10: Paciente muda de assunto durante qualificação", () => {
  it('qualificando, mas paciente pergunta sobre endereço', () => {
    const parser: ParserOutput = parserOutput({
      intent: "faq",
      confidence: 0.92,
    });
    const state: typeof EMPTY_QUALIFICATION = {
      ...EMPTY_QUALIFICATION,
      awaiting_slot: "procedimento",
      nome: "Carlos",
    };
    const result = decide({
      parser,
      message: "espera, qual o endereço da clínica?",
      qualification: state,
      knowledge: fakeKnowledge,
    });
    // Responde a FAQ. NÃO reseta qualificação.
    expect(result.type).toBe("send_interactive");
    if (result.type === "send_interactive") {
      expect(result.message.description).toContain("Rua das Flores");
    }
  });
});
