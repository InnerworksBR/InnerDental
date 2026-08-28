/**
 * Runner standalone dos testes do novo fluxo.
 *
 * Não usa Vitest (problema de binding nativo no ambiente).
 * Roda direto via tsx: `./node_modules/.bin/tsx tests/messaging/run-flow-tests.ts`
 */

import { decide, resolveHintsAgainstKnowledge, EMPTY_QUALIFICATION } from "../../src/domain/messaging/decisor.ts";
import type { ParserOutput } from "../../src/domain/messaging/intent-parser.ts";
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
// Mini test runner
// ============================================================

let passed = 0;
let failed = 0;
const failures: Array<{ name: string; error: string }> = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    failures.push({ name, error: (error as Error).message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${(error as Error).message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertContains(haystack: string, needle: string, message?: string) {
  if (!haystack.toLowerCase().includes(needle.toLowerCase())) {
    throw new Error(message ?? `Expected "${haystack}" to contain "${needle}"`);
  }
}

function assertMatches(haystack: string, pattern: RegExp, message?: string) {
  if (!pattern.test(haystack)) {
    throw new Error(message ?? `Expected "${haystack}" to match ${pattern}`);
  }
}

// ============================================================
// Cenários
// ============================================================

console.log("\n=== Cenário 1: Saudação ===");
test('"oi, boa tarde" → envia menu de opções', () => {
  const result = decide({
    parser: parserOutput({ intent: "saudacao", confidence: 0.95 }),
    message: "oi, boa tarde",
    qualification: EMPTY_QUALIFICATION,
    knowledge: fakeKnowledge,
  });
  assertEqual(result.type, "send_questions_menu");
});

console.log("\n=== Cenário 2: FAQ sobre endereço ===");
test('"qual o endereço?" → responde com FAQ verificada', () => {
  const result = decide({
    parser: parserOutput({ intent: "faq", confidence: 0.93 }),
    message: "qual o endereço?",
    qualification: EMPTY_QUALIFICATION,
    knowledge: fakeKnowledge,
  });
  assertEqual(result.type, "send_interactive");
  if (result.type === "send_interactive") {
    assertContains(result.message.description, "Rua das Flores");
  }
});

console.log("\n=== Cenário 3: Plano aceito ===");
test('"vocês aceitam Unimed?" → confirma', () => {
  const result = decide({
    parser: parserOutput({ intent: "plano", confidence: 0.92, slots: { plano_hint: "Unimed" } }),
    message: "vocês aceitam Unimed?",
    qualification: EMPTY_QUALIFICATION,
    knowledge: fakeKnowledge,
  });
  assertEqual(result.type, "send_interactive");
  if (result.type === "send_interactive") {
    assertContains(result.message.description, "Unimed");
  }
});

console.log("\n=== Cenário 4: Procedimento ===");
test('"faz clareamento?" → responde', () => {
  const result = decide({
    parser: parserOutput({ intent: "procedimento", confidence: 0.9, slots: { procedimento_hint: "clareamento" } }),
    message: "faz clareamento?",
    qualification: EMPTY_QUALIFICATION,
    knowledge: fakeKnowledge,
  });
  assertEqual(result.type, "send_interactive");
  if (result.type === "send_interactive") {
    assertContains(result.message.description, "Clareamento");
  }
});

test('"faz implante?" → mostra lista (não achou)', () => {
  const result = decide({
    parser: parserOutput({ intent: "procedimento", confidence: 0.85, slots: { procedimento_hint: "implante" } }),
    message: "faz implante?",
    qualification: EMPTY_QUALIFICATION,
    knowledge: fakeKnowledge,
  });
  assertEqual(result.type, "send_interactive");
  if (result.type === "send_interactive") {
    assertMatches(result.message.description, /Limpeza|Canal|Clareamento|Avaliação/);
  }
});

console.log("\n=== Cenário 5: Agendamento — qualificação ===");
test("começa pedindo nome", () => {
  const result = decide({
    parser: parserOutput({ intent: "agendar", confidence: 0.94 }),
    message: "quero marcar uma limpeza",
    qualification: EMPTY_QUALIFICATION,
    knowledge: fakeKnowledge,
  });
  assertEqual(result.type, "ask_qualification_slot");
  if (result.type === "ask_qualification_slot") {
    assertEqual(result.slot, "nome");
  }
});

test("paciente diz nome → pede procedimento", () => {
  const result = decide({
    parser: parserOutput({ intent: "agendar", confidence: 0.94, slots: { nome: "Maria Silva" } }),
    message: "Maria Silva",
    qualification: { ...EMPTY_QUALIFICATION, awaiting_slot: "nome" },
    knowledge: fakeKnowledge,
  });
  assertEqual(result.type, "ask_qualification_slot");
  if (result.type === "ask_qualification_slot") {
    assertEqual(result.slot, "procedimento");
  }
});

test("qualificação completa (nome + procedimento + plano + para_quem) → qualification_complete", () => {
  const result = decide({
    parser: parserOutput({ intent: "agendar", confidence: 0.95, slots: {} }),
    message: "pra mim mesmo",
    qualification: {
      awaiting_slot: "para_quem",
      nome: "João Santos",
      procedimento_id: "pr1",
      procedimento_nome: "Limpeza",
      plano_id: "p1",
      plano_nome: "Unimed",
      para_outra_pessoa: false,
    },
    knowledge: fakeKnowledge,
  });
  assertEqual(result.type, "qualification_complete");
  if (result.type === "qualification_complete") {
    assertEqual(result.summary.nome, "João Santos");
    assertEqual(result.summary.procedimento, "Limpeza");
    assertEqual(result.summary.plano, "Unimed");
  }
});

test("ainda falta para_quem → pergunta", () => {
  const result = decide({
    parser: parserOutput({ intent: "agendar", confidence: 0.95, slots: {} }),
    message: "ok",
    qualification: {
      awaiting_slot: "para_quem",
      nome: "João Santos",
      procedimento_id: "pr1",
      procedimento_nome: "Limpeza",
      plano_id: "p1",
      plano_nome: "Unimed",
    },
    knowledge: fakeKnowledge,
  });
  assertEqual(result.type, "ask_qualification_slot");
  if (result.type === "ask_qualification_slot") {
    assertEqual(result.slot, "para_quem");
  }
});

console.log("\n=== Cenário 6: Paciente irritado ===");
test('"vocês são péssimos" → escala imediatamente', () => {
  const result = decide({
    parser: parserOutput({ intent: "humano", sentiment: "irritado", confidence: 0.92, needs_human: true, reason: "reclamação" }),
    message: "vocês são péssimos",
    qualification: EMPTY_QUALIFICATION,
    knowledge: fakeKnowledge,
  });
  assertEqual(result.type, "escalate_to_human");
  if (result.type === "escalate_to_human") {
    assertContains(result.reason, "irritado");
  }
});

console.log("\n=== Cenário 7: Pedido explícito de humano ===");
test('"quero falar com alguém" → escala', () => {
  const result = decide({
    parser: parserOutput({ intent: "humano", confidence: 0.95, needs_human: true }),
    message: "quero falar com alguém",
    qualification: EMPTY_QUALIFICATION,
    knowledge: fakeKnowledge,
  });
  assertEqual(result.type, "escalate_to_human");
});

console.log("\n=== Cenário 8: Urgência médica ===");
test('"tô com dor" → marca como agendar + escalate', () => {
  const result = decide({
    parser: parserOutput({
      intent: "agendar",
      sentiment: "impaciente",
      confidence: 0.88,
      needs_human: true,
      reason: "mencionou dor",
    }),
    message: "tô com muita dor",
    qualification: EMPTY_QUALIFICATION,
    knowledge: fakeKnowledge,
  });
  assertEqual(result.type, "escalate_to_human");
  if (result.type === "escalate_to_human") {
    assertContains(result.reason, "urgência");
  }
});

console.log("\n=== Cenário 9: Resolução de hints ===");
test("plano_hint Unimed → plano_id preenchido", () => {
  const result = resolveHintsAgainstKnowledge(
    { ...EMPTY_QUALIFICATION, plano_nome: "Unimed" },
    fakeKnowledge,
  );
  assertEqual(result.plano_id, "p1");
});

test("procedimento_hint limpeza → procedimento_id preenchido", () => {
  const result = resolveHintsAgainstKnowledge(
    { ...EMPTY_QUALIFICATION, procedimento_nome: "limpeza" },
    fakeKnowledge,
  );
  assertEqual(result.procedimento_id, "pr1");
});

console.log("\n=== Cenário 10: Mudança de assunto no meio ===");
test("qualificando, paciente pergunta sobre endereço", () => {
  const result = decide({
    parser: parserOutput({ intent: "faq", confidence: 0.92 }),
    message: "espera, qual o endereço?",
    qualification: { ...EMPTY_QUALIFICATION, awaiting_slot: "procedimento", nome: "Carlos" },
    knowledge: fakeKnowledge,
  });
  assertEqual(result.type, "send_interactive");
  if (result.type === "send_interactive") {
    assertContains(result.message.description, "Rua das Flores");
  }
});

// ============================================================
// Relatório
// ============================================================

console.log("\n" + "=".repeat(50));
console.log(`Resultados: ${passed} passou, ${failed} falhou`);
if (failed > 0) {
  console.log("\nFalhas:");
  for (const f of failures) {
    console.log(`  - ${f.name}`);
    console.log(`    ${f.error}`);
  }
  process.exit(1);
}
console.log("✓ Todos os cenários passaram");
