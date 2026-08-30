/**
 * Decisor (máquina de estados em código).
 *
 * Substitui toda a lógica de decisão que antes ficava no router-tools.ts.
 * Diferente do router antigo, aqui NÃO há LLM: o decisor recebe o JSON do
 * parser e decide qual ação tomar com base em regras explícitas.
 *
 * Entrada: ParserOutput + texto original + slots persistidos + knowledge
 * Saída: Action (enviar template, persistir slot, escalar pro humano, etc)
 *
 * Princípios:
 *   - Toda decisão é rastreável: actions têm `reason` explicando o porquê.
 *   - Toda ação persiste estado (slots) pra próxima rodada ter contexto.
 *   - Nenhuma decisão operacional crítica: nunca inventa horário, plano, valor.
 *   - Em caso de dúvida, ESCALA pro humano (fail-safe).
 */

import type { Intent, ParserOutput } from "./intent-parser";
import type { KnowledgeData } from "../knowledge/service.ts";
import {
  findRequestedProcedure,
  normalizeKnowledgeTerm,
  triageInsurancePlan,
} from "../knowledge/service.ts";
import { resolveVerifiedFacts } from "../knowledge/verified-facts.ts";
import {
  initialInsurancePromptMessage,
  insurancePromptMessage,
  knowledgeAnswerInteractiveMessage,
  knowledgeFallbackMessage,
  procedurePromptMessage,
  verifiedPlanListMessage,
  verifiedProcedureListMessage,
} from "./templates.ts";

/**
 * Estado de qualificação persistido por telefone.
 *
 * Slots são semânticos (nome, procedimento, plano), não operacionais.
 * Slot ausente significa "ainda não coletado".
 * `plano_id === null` significa "paciente declarou que é particular".
 */
export type QualificationState = {
  awaiting_slot: "nome" | "procedimento" | "plano" | "para_quem" | null;
  nome?: string;
  procedimento_id?: string;
  procedimento_nome?: string;
  plano_id?: string | null;
  plano_nome?: string | null;
  para_outra_pessoa?: boolean;
  last_intent?: Intent;
  updated_at?: string;
};

export const EMPTY_QUALIFICATION: QualificationState = {
  awaiting_slot: null,
};

/**
 * Ações que o decisor pode devolver. O worker consome essa lista na ordem.
 * Cada ação é explícita sobre o que vai acontecer.
 */
export type Action =
  | { type: "send_text"; text: string; reason: string; persist?: Partial<QualificationState> }
  | {
      type: "send_interactive";
      message: ReturnType<typeof knowledgeAnswerInteractiveMessage>;
      reason: string;
      persist?: Partial<QualificationState>;
    }
  | { type: "send_questions_menu"; reason: string }
  | { type: "escalate_to_human"; reason: string; summary: PatientSummary }
  | {
      type: "ask_qualification_slot";
      slot: "nome" | "procedimento" | "plano" | "para_quem";
      text: string;
      reason: string;
      persist: Partial<QualificationState>;
    }
  | { type: "qualification_complete"; summary: PatientSummary; reason: string }
  | { type: "no_action"; reason: string };

/**
 * Resumo estruturado do paciente qualificado.
 * É o que vai pro humano (via WhatsApp da doutora ou painel).
 */
export type PatientSummary = {
  nome: string;
  procedimento: string;
  plano: string;
  para_quem: string;
  observacao?: string;
};

/**
 * Entrada do decisor.
 */
export type DecideInput = {
  parser: ParserOutput;
  message: string;
  qualification: QualificationState;
  knowledge: KnowledgeData;
};

/**
 * Decide qual ação tomar. Função pura — sem efeitos colaterais.
 */
export function decide(input: DecideInput): Action {
  const { parser, message, qualification, knowledge } = input;

  // 1) Humano/urgência sempre escala.
  if (parser.needs_human || parser.intent === "humano") {
    return {
      type: "escalate_to_human",
      reason: parser.needs_human
        ? `Paciente ${parser.sentiment === "irritado" ? "irritado" : "com urgência"}: ${parser.reason ?? ""}`
        : "Paciente pediu atendimento humano explicitamente",
      summary: buildSummaryFromState(qualification, message, parser),
    };
  }

  // 2) Saudação → menu.
  if (parser.intent === "saudacao") {
    return {
      type: "send_questions_menu",
      reason: "Saudação inicial: apresenta menu de opções",
    };
  }

  // 3) FAQ → consulta verified-facts.
  if (parser.intent === "faq") {
    const resolution = resolveVerifiedFacts(message, knowledge);
    if (resolution.kind === "resolved" && resolution.facts.faq) {
      return {
        type: "send_interactive",
        message: knowledgeAnswerInteractiveMessage(resolution.facts.faq.answer),
        reason: "FAQ encontrada em verified-facts",
      };
    }
    return {
      type: "send_text",
      text: knowledgeFallbackMessage,
      reason: "FAQ não encontrada nos dados verificados",
    };
  }

  // 4) Plano → consulta planos conhecidos.
  if (parser.intent === "plano") {
    return handlePlanQuestion(parser, message, knowledge);
  }

  // 5) Procedimento → consulta procedimentos.
  if (parser.intent === "procedimento") {
    return handleProcedureQuestion(parser, message, knowledge);
  }

  // 6) Agendar → qualificação.
  if (parser.intent === "agendar") {
    return handleScheduling(parser, message, qualification);
  }

  // Fail-safe.
  return {
    type: "escalate_to_human",
    reason: "Intenção não classificada",
    summary: buildSummaryFromState(qualification, message, parser),
  };
}

// ============================================================
// Handlers
// ============================================================

function handlePlanQuestion(parser: ParserOutput, message: string, knowledge: KnowledgeData): Action {
  // Paciente deu nome do plano na mensagem.
  if (parser.slots.plano_hint) {
    const triage = triageInsurancePlan(parser.slots.plano_hint, knowledge);

    if (triage.kind === "accepted" && triage.plan) {
      if (triage.plan.active) {
        return {
          type: "send_interactive",
          message: knowledgeAnswerInteractiveMessage(`Sim, atendemos *${triage.plan.name}*.`, []),
          reason: `Plano "${parser.slots.plano_hint}" aceito`,
        };
      }
      // Plano inativo: trata como não aceito.
      return {
        type: "send_text",
        text: "Esse plano não está na nossa lista de atendimento agora. Se quiser, posso conectar você com a equipe para confirmar.",
        reason: `Plano "${parser.slots.plano_hint}" não está ativo`,
      };
    }

    if (triage.kind === "ambiguous") {
      return {
        type: "send_text",
        text: initialInsurancePromptMessage,
        reason: `Plano "${parser.slots.plano_hint}" ambíguo, pede nome completo`,
      };
    }

    // unsupported: plano não encontrado ou inativo.
    return {
      type: "send_text",
      text: "Esse plano não está na nossa lista de atendimento agora. Se quiser, posso conectar você com a equipe para confirmar.",
      reason: `Plano "${parser.slots.plano_hint}" não encontrado ou inativo`,
    };
  }

  // Pergunta genérica (sem nome de plano).
  const isListQuestion = /\b(planos?|convenios?)\b/.test(normalizeKnowledgeTerm(message)) &&
    /\b(quais|lista|todos|aceitos?)\b/.test(normalizeKnowledgeTerm(message));

  if (isListQuestion) {
    const active = knowledge.plans.filter((p) => p.active);
    return {
      type: "send_interactive",
      message: knowledgeAnswerInteractiveMessage(verifiedPlanListMessage(active), []),
      reason: "Lista de planos ativos",
    };
  }

  // Não conseguiu classificar → pede o nome.
  return {
    type: "send_text",
    text: insurancePromptMessage,
    reason: "Pergunta sobre plano sem nome específico",
  };
}

function handleProcedureQuestion(parser: ParserOutput, message: string, knowledge: KnowledgeData): Action {
  if (parser.slots.procedimento_hint) {
    const procedure = findRequestedProcedure(parser.slots.procedimento_hint, knowledge);
    if (procedure) {
      const desc = procedure.description ?? "Consulte a equipe para detalhes.";
      const booking = procedure.online_booking ? "Pode ser agendado pelo portal." : "Equipe precisa orientar.";
      return {
        type: "send_interactive",
        message: knowledgeAnswerInteractiveMessage(`${procedure.name}: ${desc} ${booking}`, []),
        reason: `Procedimento "${parser.slots.procedimento_hint}" encontrado`,
      };
    }
    // Não achou → lista os ativos.
    const active = knowledge.procedures.filter((p) => p.active);
    return {
      type: "send_interactive",
      message: knowledgeAnswerInteractiveMessage(verifiedProcedureListMessage(active), []),
      reason: `Procedimento "${parser.slots.procedimento_hint}" não encontrado, mostra lista`,
    };
  }

  // Lista de procedimentos.
  const isListQuestion = /\b(procedimentos?|tratamentos?|servicos?)\b/.test(normalizeKnowledgeTerm(message)) &&
    /\b(quais|lista|todos)\b/.test(normalizeKnowledgeTerm(message));

  if (isListQuestion) {
    const active = knowledge.procedures.filter((p) => p.active);
    return {
      type: "send_interactive",
      message: knowledgeAnswerInteractiveMessage(verifiedProcedureListMessage(active), []),
      reason: "Lista de procedimentos",
    };
  }

  return {
    type: "send_text",
    text: procedurePromptMessage,
    reason: "Pergunta sobre procedimento sem nome específico",
  };
}

function handleScheduling(
  parser: ParserOutput,
  message: string,
  state: QualificationState,
): Action {
  // Aplica o que o parser trouxe.
  const next = applyParserSlots(state, parser);

  // Verifica se ainda falta algo.
  const missing = findMissingSlot(next);

  if (!missing) {
    return {
      type: "qualification_complete",
      summary: buildSummaryFromState(next, message, parser),
      reason: "Todos os 4 slots preenchidos",
    };
  }

  // Pede o próximo slot que falta.
  return askForSlot(missing, next, parser);
}

// ============================================================
// Slot helpers
// ============================================================

function findMissingSlot(
  state: QualificationState,
): "nome" | "procedimento" | "plano" | "para_quem" | null {
  if (!state.nome) return "nome";
  if (!state.procedimento_id) return "procedimento";
  if (state.plano_id === undefined) return "plano";
  if (state.para_outra_pessoa === undefined) return "para_quem";
  return null;
}

function applyParserSlots(state: QualificationState, parser: ParserOutput): QualificationState {
  const next: QualificationState = { ...state };

  // Nome: parser entrega como slot direto.
  if (parser.slots.nome && !next.nome) {
    next.nome = parser.slots.nome.trim();
  }

  // Para quem: parser entrega como boolean.
  if (parser.slots.para_outra_pessoa !== undefined && next.para_outra_pessoa === undefined) {
    next.para_outra_pessoa = parser.slots.para_outra_pessoa;
  }

  // Procedimento: parser entrega como hint textual. Resolução real fica pra um
  // serviço externo que valida contra knowledge.procedures (chamado pelo worker).
  if (parser.slots.procedimento_hint && !next.procedimento_nome) {
    next.procedimento_nome = parser.slots.procedimento_hint;
  }

  // Plano: parser entrega como hint textual. Validação externa também.
  if (parser.slots.plano_hint && next.plano_id === undefined) {
    next.plano_nome = parser.slots.plano_hint;
  }

  next.last_intent = parser.intent;
  return next;
}

function askForSlot(
  missing: "nome" | "procedimento" | "plano" | "para_quem",
  state: QualificationState,
  parser: ParserOutput,
): Action {
  if (missing === "nome") {
    return {
      type: "ask_qualification_slot",
      slot: "nome",
      text: "Pra eu te conectar com a doutora, me diz seu *nome completo*?",
      reason: "Coletando nome do paciente",
      persist: { awaiting_slot: "nome" },
    };
  }
  if (missing === "procedimento") {
    return {
      type: "ask_qualification_slot",
      slot: "procedimento",
      text: "Qual *procedimento* você quer marcar? (limpeza, canal, clareamento, etc)",
      reason: "Coletando procedimento desejado",
      persist: { awaiting_slot: "procedimento" },
    };
  }
  if (missing === "plano") {
    return {
      type: "ask_qualification_slot",
      slot: "plano",
      text: "Você tem *plano odontológico* ou prefere *particular*?",
      reason: "Coletando plano do paciente",
      persist: { awaiting_slot: "plano" },
    };
  }
  // para_quem
  return {
    type: "ask_qualification_slot",
    slot: "para_quem",
    text: "A consulta é *pra você* ou *pra outra pessoa*?",
    reason: "Confirmando para quem é a consulta",
    persist: { awaiting_slot: "para_quem" },
  };
}

function buildSummaryFromState(state: QualificationState, message: string, parser: ParserOutput): PatientSummary {
  return {
    nome: state.nome ?? "Não informado",
    procedimento: state.procedimento_nome ?? state.procedimento_id ?? "Não informado",
    plano:
      state.plano_nome ??
      (state.plano_id === null ? "Particular" : "Não informado"),
    para_quem: state.para_outra_pessoa === true ? "Outra pessoa" : "Paciente",
    observacao: parser.reason ?? undefined,
  };
}

/**
 * Resolve slots textuais (procedimento_hint, plano_hint) contra knowledge.
 * Chamado pelo worker ANTES de chamar decide() — o decisor recebe
 * procedimento_id e plano_id já validados.
 *
 * Retorna um patch pra aplicar sobre o estado antes da decisão.
 */
export function resolveHintsAgainstKnowledge(
  state: QualificationState,
  knowledge: KnowledgeData,
): QualificationState {
  const next: QualificationState = { ...state };

  if (next.procedimento_nome && !next.procedimento_id) {
    const found = findRequestedProcedure(next.procedimento_nome, knowledge);
    if (found) {
      next.procedimento_id = found.id;
      next.procedimento_nome = found.name; // normaliza
    }
  }

  if (next.plano_nome && next.plano_id === undefined) {
    const triage = triageInsurancePlan(next.plano_nome, knowledge);
    if (triage.kind === "accepted" && triage.plan && triage.plan.active) {
      next.plano_id = triage.plan.id;
      next.plano_nome = triage.plan.name;
      return next;
    }
    // Plan inativo, ambíguo ou não encontrado: limpa o nome persistido para
    // forçar a próxima rodada a passar pela rejeição educada de
    // handlePlanQuestion (em vez de ficar presa re-avaliando o mesmo hint).
    next.plano_nome = undefined;
  }

  return next;
}
