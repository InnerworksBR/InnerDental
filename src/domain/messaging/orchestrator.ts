/**
 * Orquestrador do novo fluxo de atendimento.
 *
 * Substitui a chamada `routeWithTools` + `executeRouterTool` que existia no worker.
 *
 * Responsabilidades:
 *   1. Carrega estado persistido (slots da conversa)
 *   2. Chama o parser de intenção (única chamada à LLM)
 *   3. Resolve hints textuais contra knowledge (plano, procedimento)
 *   4. Chama o decisor (máquina de estados pura)
 *   5. Retorna ações estruturadas que o worker aplica
 *
 * NÃO ENVIA mensagens, NÃO persiste estado, NÃO toca em banco.
 * Quem faz isso é o worker — esse módulo é puro.
 */

import { parseIntent, ParserError, type ParserInput, type ParserOutput } from "./intent-parser.ts";
import { decide, resolveHintsAgainstKnowledge, type Action, type DecideInput, type QualificationState } from "./decisor.ts";
import type { KnowledgeData } from "../knowledge/service.ts";

/**
 * Entrada do orquestrador.
 */
export type OrchestrateInput = {
  message: string;
  phone: string;
  qualification: QualificationState;
  knowledge: KnowledgeData;
  recentTurns: Array<{ role: "patient" | "luna"; text: string }>;
  openai: { apiKey: string; model: string; timeoutMs?: number };
};

/**
 * Saída do orquestrador: ações a serem aplicadas pelo worker + metadata.
 */
export type OrchestrateResult = {
  parser: ParserOutput;
  qualificationAfterResolve: QualificationState;
  action: Action;
  fallbackReason?: "OPENAI_UNREACHABLE" | "OPENAI_TIMEOUT" | "OPENAI_EMPTY" | "OPENAI_SCHEMA_INVALID";
};

/**
 * Orquestra uma rodada de atendimento.
 *
 * Em caso de falha do parser (sem API key, timeout, schema inválido),
 * retorna fallbackReason e uma action segura (pede nome, escala, etc).
 */
export async function orchestrate(input: OrchestrateInput): Promise<OrchestrateResult> {
  const parserInput: ParserInput = {
    message: input.message,
    recentTurns: input.recentTurns,
    awaitingSlot: input.qualification.awaiting_slot,
  };

  let parser: ParserOutput;
  try {
    parser = await parseIntent(parserInput, input.openai);
  } catch (error) {
    if (error instanceof ParserError) {
      return handleParserFailure(error, input);
    }
    return handleParserFailure(new ParserError("OPENAI_UNREACHABLE", (error as Error).message), input);
  }

  // Resolve hints textuais contra knowledge antes de decidir.
  const resolved = resolveHintsAgainstKnowledge(input.qualification, input.knowledge);

  const decideInput: DecideInput = {
    parser,
    message: input.message,
    qualification: resolved,
    knowledge: input.knowledge,
  };

  const action = decide(decideInput);

  return {
    parser,
    qualificationAfterResolve: resolved,
    action,
  };
}

/**
 * Fail-safe: parser falhou. Decisor roda sem IA, baseado em heurística simples.
 *
 * Política: na dúvida, escala pro humano. Nunca inventa resposta.
 */
function handleParserFailure(error: ParserError, input: OrchestrateInput): OrchestrateResult {
  const safeState: QualificationState = {
    ...input.qualification,
    awaiting_slot: input.qualification.awaiting_slot ?? "nome",
  };

  // Se já temos qualificação completa, escala com o que temos.
  const hasAll =
    safeState.nome &&
    safeState.procedimento_id &&
    safeState.plano_id !== undefined &&
    safeState.para_outra_pessoa !== undefined;

  if (hasAll) {
    return {
      parser: emptyParserOutput(),
      qualificationAfterResolve: safeState,
      action: {
        type: "qualification_complete",
        reason: "Parser falhou, mas qualificação estava completa",
        summary: {
          nome: safeState.nome ?? "Não informado",
          procedimento: safeState.procedimento_nome ?? safeState.procedimento_id ?? "Não informado",
          plano: safeState.plano_nome ?? (safeState.plano_id === null ? "Particular" : "Não informado"),
          para_quem: safeState.para_outra_pessoa === true ? "Outra pessoa" : "Paciente",
        },
      },
      fallbackReason: error.code,
    };
  }

  // Senão, pede o próximo slot com mensagem segura (sem promessas).
  return {
    parser: emptyParserOutput(),
    qualificationAfterResolve: safeState,
    action: {
      type: "ask_qualification_slot",
      slot: safeState.awaiting_slot ?? "nome",
      text: "Tô com uma instabilidade rápida aqui. Me confirma seu *nome* pra eu te conectar com a equipe?",
      reason: `Parser indisponível (${error.code}), pedindo nome`,
      persist: { awaiting_slot: "nome" },
    },
    fallbackReason: error.code,
  };
}

function emptyParserOutput(): ParserOutput {
  return {
    intent: "humano",
    sentiment: "ok",
    confidence: 0,
    slots: {},
    needs_human: false,
  };
}

/**
 * Estado inicial pra um telefone que nunca conversou.
 */
export function emptyQualification(): QualificationState {
  return { awaiting_slot: null };
}
