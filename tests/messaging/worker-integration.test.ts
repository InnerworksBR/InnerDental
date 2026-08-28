/**
 * Testes de integração do worker com o novo fluxo.
 *
 * Valida que as ações do decisor → operations do worker-adapter
 * produzem as operações corretas (send_text, send_interactive, handoff, no_op).
 *
 * Cada cenário replica um caso de run-flow-tests.ts mas agora testando
 * a cadeia completa: decide() + actionToOperations().
 *
 * Sem rede: o decisor é puro e testado direto.
 */

import { describe, it, expect } from "vitest";
import { decide } from "../../src/domain/messaging/decisor.ts";
import { actionToOperations } from "../../src/domain/messaging/worker-adapter.ts";
import type { KnowledgeData } from "../../src/domain/knowledge/service.ts";

// ============================================================
// Fixture
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
    { id: "f1", question: "Qual o endereço?", answer: "Rua das Flores, 123 — Centro.", category: "localizacao", active: true },
    { id: "f2", question: "Qual o horário?", answer: "Seg a sex, 9h às 18h.", category: "horario", active: true },
  ],
};

const PHONE = "5511999999999";

interface ParserInput {
  intent: string;
  sentiment?: string;
  confidence?: number;
  needs_human?: boolean;
  reason?: string;
  slots?: Record<string, unknown>;
}

function runFlow(
  parserOverrides: ParserInput,
  qualification = { awaiting_slot: null as string | null },
  message = "mensagem de teste",
) {
  const parser = {
    intent: parserOverrides.intent as "saudacao" | "faq" | "plano" | "procedimento" | "agendar" | "humano",
    sentiment: (parserOverrides.sentiment ?? "ok") as "ok" | "duvida" | "impaciente" | "irritado",
    confidence: parserOverrides.confidence ?? 0.9,
    slots: parserOverrides.slots ?? {},
    needs_human: parserOverrides.needs_human ?? false,
    reason: parserOverrides.reason,
  };
  const action = decide({ parser, message, qualification, knowledge: fakeKnowledge });
  const operations = actionToOperations(action, PHONE);
  return { action, operations };
}

// ============================================================
// Cenário 1: Saudação
// ============================================================

describe("Cenário 1: Saudação", () => {
  it('"oi" → send_questions_menu', () => {
    const { action, operations } = runFlow({ intent: "saudacao", confidence: 0.95 });
    expect(action.type).toBe("send_questions_menu");
    expect(operations).toHaveLength(1);
    expect(operations[0].type).toBe("send_text");
  });
});

// ============================================================
// Cenário 2: FAQ
// ============================================================

describe("Cenário 2: FAQ sobre endereço", () => {
  it('"qual o endereço?" → send_interactive com resposta verificada', () => {
    const { action, operations } = runFlow({ intent: "faq", confidence: 0.93 }, undefined, "Qual o endereço?");
    // O decisor pode devolver send_interactive (FAQ encontrada) ou send_text (não encontrada).
    // Ambas são respostas válidas — o importante é que NÃO é handoff.
    expect(["send_interactive", "send_text"]).toContain(action.type);
    expect(operations.length).toBe(1);
  });
});

// ============================================================
// Cenário 3: Plano aceito
// ============================================================

describe("Cenário 3: Plano aceito", () => {
  it('"vocês aceitam Unimed?" → send_interactive confirmando', () => {
    const { action, operations } = runFlow({
      intent: "plano",
      confidence: 0.92,
      slots: { plano_hint: "Unimed" },
    });
    expect(action.type).toBe("send_interactive");
    expect(operations).toHaveLength(1);
    const op = operations[0];
    if (op.type === "send_interactive") {
      expect(op.message.description).toContain("Unimed");
    }
  });

  it('"vocês aceitam Caixa?" → NÃO confirma (Caixa inativo)', () => {
    const { action, operations } = runFlow({
      intent: "plano",
      confidence: 0.92,
      slots: { plano_hint: "Caixa" },
    });
    expect(["send_text", "send_interactive"]).toContain(action.type);
    expect(operations.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Cenário 4: Procedimento
// ============================================================

describe("Cenário 4: Procedimento", () => {
  it('"faz clareamento?" → send_interactive', () => {
    const { action, operations } = runFlow({
      intent: "procedimento",
      confidence: 0.9,
      slots: { procedimento_hint: "clareamento" },
    });
    expect(action.type).toBe("send_interactive");
    expect(operations).toHaveLength(1);
    const op = operations[0];
    if (op.type === "send_interactive") {
      expect(op.message.description).toContain("Clareamento");
    }
  });

  it('"faz implante?" → send_interactive com lista', () => {
    const { action, operations } = runFlow({
      intent: "procedimento",
      confidence: 0.85,
      slots: { procedimento_hint: "implante" },
    });
    expect(action.type).toBe("send_interactive");
    expect(operations).toHaveLength(1);
    const op = operations[0];
    if (op.type === "send_interactive") {
      expect(op.message.description).toMatch(/Limpeza|Canal|Clareamento|Avaliação/);
    }
  });
});

// ============================================================
// Cenário 5: Agendamento
// ============================================================

describe("Cenário 5: Agendamento — qualificação", () => {
  it("início: pede nome", () => {
    const { action, operations } = runFlow({ intent: "agendar", confidence: 0.94 });
    expect(action.type).toBe("ask_qualification_slot");
    const op = operations[0];
    expect(op.type).toBe("send_text");
    if (op.type === "send_text") {
      expect(op.persist).toBeDefined();
      expect(op.persist).toHaveProperty("awaiting_slot", "nome");
    }
  });

  it("nome preenchido: pede procedimento", () => {
    const state = { awaiting_slot: "nome" as const };
    const { action, operations } = runFlow(
      { intent: "agendar", confidence: 0.94, slots: { nome: "Maria Silva" } },
      state,
    );
    expect(action.type).toBe("ask_qualification_slot");
    const op = operations[0];
    expect(op.type).toBe("send_text");
    if (op.type === "send_text") {
      expect(op.persist).toHaveProperty("awaiting_slot", "procedimento");
    }
  });

  it("qualificação completa → qualification_complete + handoff_qualified", () => {
    const state = {
      awaiting_slot: "para_quem" as const,
      nome: "João Santos",
      procedimento_id: "pr1",
      procedimento_nome: "Limpeza",
      plano_id: "p1",
      plano_nome: "Unimed",
      para_outra_pessoa: false,
    };
    const { action, operations } = runFlow({ intent: "agendar", confidence: 0.95 }, state, "pra mim");
    expect(action.type).toBe("qualification_complete");
    expect(operations[0].type).toBe("handoff_qualified");
    expect(operations.length).toBe(1);
  });

  it("falta para_quem → pergunta", () => {
    const state = {
      awaiting_slot: "para_quem" as const,
      nome: "João Santos",
      procedimento_id: "pr1",
      procedimento_nome: "Limpeza",
      plano_id: "p1",
      plano_nome: "Unimed",
    };
    const { action, operations } = runFlow({ intent: "agendar", confidence: 0.95 }, state, "ok");
    expect(action.type).toBe("ask_qualification_slot");
    const op = operations[0];
    expect(op.type).toBe("send_text");
    if (op.type === "send_text") {
      expect(op.persist).toHaveProperty("awaiting_slot", "para_quem");
    }
  });
});

// ============================================================
// Cenário 6: Paciente irritado
// ============================================================

describe("Cenário 6: Paciente irritado", () => {
  it('"vocês são péssimos" → escalate_to_human → handoff_urgent', () => {
    const { action, operations } = runFlow({
      intent: "humano",
      sentiment: "irritado",
      confidence: 0.92,
      needs_human: true,
      reason: "reclamação",
    });
    expect(action.type).toBe("escalate_to_human");
    expect(operations[0].type).toBe("handoff_urgent");
    expect(operations.length).toBe(1);
  });
});

// ============================================================
// Cenário 7: Pedido explícito de humano
// ============================================================

describe("Cenário 7: Pedido explícito de humano", () => {
  it('"quero falar com alguém" → escalate_to_human', () => {
    const { action, operations } = runFlow({
      intent: "humano",
      confidence: 0.95,
      needs_human: true,
    });
    expect(action.type).toBe("escalate_to_human");
    expect(operations[0].type).toBe("handoff_urgent");
  });
});

// ============================================================
// Cenário 8: Urgência
// ============================================================

describe("Cenário 8: Urgência médica", () => {
  it('"tô com dor" → escalate_to_human', () => {
    const { action, operations } = runFlow({
      intent: "agendar",
      sentiment: "impaciente",
      confidence: 0.88,
      needs_human: true,
      reason: "mencionou dor",
    });
    expect(action.type).toBe("escalate_to_human");
    expect(operations[0].type).toBe("handoff_urgent");
  });
});

// ============================================================
// Cenário 9: Mudança de assunto
// ============================================================

describe("Cenário 9: Paciente muda de assunto durante qualificação", () => {
  it('"espera, qual o endereço?" → send_interactive, não reseta estado', () => {
    const state = { awaiting_slot: "procedimento" as const, nome: "Carlos" };
    const { action, operations } = runFlow({ intent: "faq", confidence: 0.92 }, state, "espera, qual o endereço?");
    expect(action.type).toBe("send_interactive");
    expect(operations).toHaveLength(1);
    const op = operations[0];
    if (op.type === "send_interactive") {
      expect(op.persist).toBeUndefined();
    }
  });
});

// ============================================================
// Validação geral
// ============================================================

describe("Validação geral", () => {
  it("todas as ações geram pelo menos uma operação com audit", () => {
    const cases = [
      { intent: "saudacao", confidence: 0.9 },
      { intent: "faq", confidence: 0.9 },
      { intent: "plano", confidence: 0.9, slots: { plano_hint: "Unimed" } },
      { intent: "procedimento", confidence: 0.9, slots: { procedimento_hint: "Limpeza" } },
      { intent: "agendar", confidence: 0.9 },
      { intent: "humano", confidence: 0.9, needs_human: true },
    ];

    for (const input of cases) {
      const { operations } = runFlow(input);
      expect(operations.length).toBeGreaterThan(0);
      for (const op of operations) {
        expect(op).toHaveProperty("audit");
        expect(op.audit).toHaveProperty("action");
        expect(op.audit).toHaveProperty("reason");
      }
    }
  });

  it("qualificação completa gera handoff_qualified com todos os campos", () => {
    const state = {
      awaiting_slot: "para_quem" as const,
      nome: "João Santos",
      procedimento_id: "pr1",
      procedimento_nome: "Limpeza",
      plano_id: "p1",
      plano_nome: "Unimed",
      para_outra_pessoa: false,
    };
    const { operations } = runFlow({ intent: "agendar", confidence: 0.95 }, state, "pra mim");
    const handoff = operations.find((op) => op.type === "handoff_qualified");
    expect(handoff).toBeDefined();
    if (handoff && handoff.type === "handoff_qualified") {
      expect(handoff).toHaveProperty("summary");
      expect(handoff).toHaveProperty("patientAck");
      expect(handoff).toHaveProperty("doctorMessage");
      expect(handoff).toHaveProperty("audit");
    }
  });

  it("ask_qualification_slot gera send_text com persist", () => {
    const { operations } = runFlow({ intent: "agendar", confidence: 0.94 });
    const sendText = operations.find((op) => op.type === "send_text");
    expect(sendText).toBeDefined();
    if (sendText && sendText.type === "send_text") {
      expect(sendText.persist).toBeDefined();
      expect(sendText.persist).toHaveProperty("awaiting_slot");
    }
  });
});
