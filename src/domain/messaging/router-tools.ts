/**
 * Router tool registry for the LLM-driven WhatsApp triage (PR 3).
 *
 * `ROUTER_TOOLS` enumerates every tool the LLM router is allowed to invoke
 * in a single turn. Each definition pairs the OpenAI-visible schema (the
 * `description` the LLM reads and the JSON-schema `parameters` it must
 * fill) with a typed executor the worker will call once the router decides
 * to fire the tool.
 *
 * This PR is purely additive: the executors here are stubs that return a
 * placeholder reply (`__stub__:<tool>`) and **do not** call any RPC or
 * Evolution endpoint. PR 6 wires each stub to the corresponding template
 * + RPC listed in `velvet-hopping-raven.md` (e.g. `request_scheduling_link`
 * → `prepare_whatsapp_access_link` + `accessLinkInteractiveMessage` +
 * `sendBotButtons`). The intent is that the registry and signatures stay
 * stable so PR 6 becomes a sequence of body fills rather than a refactor.
 *
 * Routing-mode policy:
 * - `llm` and `shadow` allow every tool (the executor is the same; the
 *   observer mode in PR 4 just records the verdict without sending).
 * - `regex_only` and `off` allow nothing — the router is bypassed and the
 *   regex cascade takes over.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvolutionClient } from "@/integrations/evolution/client";
import type { KnowledgeData } from "@/domain/knowledge/service";
import type { ConversationSlots } from "@/domain/messaging/slots";
import type { InteractiveMessage } from "@/domain/messaging/templates";
import type { ToolName } from "@/integrations/openai/router-types";

/**
 * `off`        — registry disabled; router is bypassed entirely.
 * `shadow`     — LLM observes the patient turn and records the tool it
 *                *would* have called, but the worker still answers with
 *                the regex cascade. PR 4 turns this on.
 * `llm`        — LLM decides and its tool calls are executed.
 * `regex_only` — LLM is bypassed (no shadow either). Emergency / rollback
 *                mode used when the OpenAI integration is unavailable.
 */
export type ToolMode = "off" | "shadow" | "llm" | "regex_only";

/** Surface handed to every tool executor. */
export type RouterToolContext = {
  phone: string;
  inboxId: string;
  supabase: SupabaseClient;
  evolution: Pick<EvolutionClient, "sendText" | "sendButtons">;
  knowledge: KnowledgeData;
  slots: ConversationSlots;
};

/**
 * Result of a tool execution.
 *
 * - `reply`           — text or interactive payload the worker should hand
 *                       to `sendReply` after all tools of a turn have run.
 * - `slotWrites`      — optional partial slot merge that the worker will
 *                       pass to `apply_whatsapp_conversation_slots`.
 * - `handoff`         — when true, the worker enqueues a human handoff via
 *                       the existing RPC and clears the slots.
 */
export type RouterToolResult = {
  reply: string | InteractiveMessage;
  slotWrites?: Partial<ConversationSlots>;
  handoff?: boolean;
};

/** JSON-schema object parameters for a tool. */
export type RouterToolParameters = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

/** Static definition for a single tool. */
export type RouterToolDefinition = {
  name: ToolName;
  /** Description the LLM sees. Must be a stable, terse instruction. */
  description: string;
  /** Strict JSON-schema the LLM must fill before invocation. */
  parameters: RouterToolParameters;
  /** Routing modes where this tool is allowed to execute. */
  requires: { routingMode: ToolMode[] };
  /**
   * Tool executor. PR 3 returns a stub; PR 6 wires real RPC + template.
   * Must remain async + pure (no module-level mutable state) so the worker
   * can call it inside the existing inbox lease loop.
   */
  execute: (args: Record<string, unknown>, ctx: RouterToolContext) => Promise<RouterToolResult>;
};

/** Empty schema for tools that take no arguments. */
const NO_ARGUMENTS: RouterToolParameters = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

/** Tool modes that actually execute the tool. Shadow records but does not. */
const LLM_AND_SHADOW: ToolMode[] = ["llm", "shadow"];

/**
 * Build a stub executor for a no-argument tool. Returns a placeholder reply
 * so the worker can keep running end-to-end while PR 6 fills the body. The
 * `TODO_PR6` marker is consumed by the PR 6 agent when it swaps the body.
 */
function stubExecutor(name: ToolName): RouterToolDefinition["execute"] {
  return async () => ({ reply: `__stub__:${name}` });
}

/**
 * Build a stub executor for a tool that declares arguments. The args are
 * ignored in PR 3; PR 6 will read them. Keeping the same signature across
 * tools means the worker can dispatch by name without conditional bodies.
 */
function stubExecutorWithArgs(name: ToolName): RouterToolDefinition["execute"] {
  return async (_args, _ctx) => ({ reply: `__stub__:${name}` });
}

/** Canonical ordered list of the 18 tool names. Used for registry audits. */
export const ROUTER_TOOL_NAMES: readonly ToolName[] = [
  "request_scheduling_link",
  "answer_plan",
  "answer_plan_list",
  "answer_procedure",
  "answer_procedure_list",
  "answer_coverage",
  "answer_child_policy",
  "answer_faq",
  "ask_plan",
  "accept_plan",
  "reject_plan",
  "ask_procedure",
  "confirm_attendance",
  "lookup_upcoming_appointment",
  "handoff",
  "greet",
  "send_questions_menu",
  "send_unsupported_media_reply",
] as const;

/**
 * Full registry. Each entry is a stub — the description and parameter
 * shape are the only load-bearing fields in PR 3; the executor body is
 * replaced in PR 6 (see the per-tool `TODO_PR6` notes).
 */
export const ROUTER_TOOLS: Record<ToolName, RouterToolDefinition> = {
  request_scheduling_link: {
    name: "request_scheduling_link",
    description: "Envia o link seguro do portal para o paciente agendar, remarcar ou cancelar uma consulta. Use quando o paciente pedir explicitamente o link ou quando a intenção for agendar.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["schedule", "reschedule", "cancel"],
          description: "Tipo de ação de agenda que originou o pedido.",
        },
      },
      required: ["kind"],
      additionalProperties: false,
    },
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: chamar prepare_whatsapp_access_link(phone) e devolver accessLinkInteractiveMessage(url, kind).
    execute: stubExecutorWithArgs("request_scheduling_link"),
  },
  answer_plan: {
    name: "answer_plan",
    description: "Responde se um plano odontológico específico é atendido, usando apenas planos ativos no cadastro.",
    parameters: {
      type: "object",
      properties: {
        plan_id: {
          type: "string",
          description: "Identificador do plano ativo retornado pelo knowledge.",
        },
      },
      required: ["plan_id"],
      additionalProperties: false,
    },
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: localizar plano em knowledge.plans, montar verifiedPlanMessage, devolver knowledgeAnswerInteractiveMessage.
    execute: stubExecutorWithArgs("answer_plan"),
  },
  answer_plan_list: {
    name: "answer_plan_list",
    description: "Lista todos os planos ativos aceitos pela clínica.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: devolver knowledgeAnswerInteractiveMessage(verifiedPlanListMessage(knowledge.plans)).
    execute: stubExecutor("answer_plan_list"),
  },
  answer_procedure: {
    name: "answer_procedure",
    description: "Descreve um procedimento odontológico cadastrado, indicando se o agendamento pode iniciar pelo portal.",
    parameters: {
      type: "object",
      properties: {
        procedure_id: {
          type: "string",
          description: "Identificador do procedimento retornado pelo knowledge.",
        },
      },
      required: ["procedure_id"],
      additionalProperties: false,
    },
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: montar verifiedProcedureMessage e devolver knowledgeAnswerInteractiveMessage (com botão URL se online_booking).
    execute: stubExecutorWithArgs("answer_procedure"),
  },
  answer_procedure_list: {
    name: "answer_procedure_list",
    description: "Lista todos os procedimentos odontológicos cadastrados.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: devolver knowledgeAnswerInteractiveMessage(verifiedProcedureListMessage(knowledge.procedures)).
    execute: stubExecutor("answer_procedure_list"),
  },
  answer_coverage: {
    name: "answer_coverage",
    description: "Informa se um procedimento está coberto por um plano específico usando apenas a tabela de cobertura.",
    parameters: {
      type: "object",
      properties: {
        plan_id: { type: "string", description: "Identificador do plano." },
        procedure_id: { type: "string", description: "Identificador do procedimento." },
      },
      required: ["plan_id", "procedure_id"],
      additionalProperties: false,
    },
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: resolveVerifiedFacts + verifiedCoverageMessage + knowledgeAnswerInteractiveMessage.
    execute: stubExecutorWithArgs("answer_coverage"),
  },
  answer_child_policy: {
    name: "answer_child_policy",
    description: "Responde sobre a política de atendimento infantil usando o procedimento cadastrado (ex.: odontopediatria).",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: findChildCarePolicy + verifiedProcedureMessage (sem botão de agendamento).
    execute: stubExecutor("answer_child_policy"),
  },
  answer_faq: {
    name: "answer_faq",
    description: "Responde uma dúvida administrativa (FAQ) usando apenas a base verificada, sem fabricar valores, URLs ou planos.",
    parameters: {
      type: "object",
      properties: {
        faq_id: { type: "string", description: "Identificador da FAQ ativa retornada pelo knowledge." },
      },
      required: ["faq_id"],
      additionalProperties: false,
    },
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: reusar generateClinicReply (chat.ts) para grounding, devolver knowledgeAnswerInteractiveMessage.
    execute: stubExecutorWithArgs("answer_faq"),
  },
  ask_plan: {
    name: "ask_plan",
    description: "Pede ao paciente o nome do plano odontológico antes de continuar o fluxo.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: devolver initialInsurancePromptMessage e marcar slot awaiting_plan=true.
    execute: stubExecutor("ask_plan"),
  },
  accept_plan: {
    name: "accept_plan",
    description: "Confirma o plano informado pelo paciente, registra a aceitação via RPC e devolve o link do portal.",
    parameters: {
      type: "object",
      properties: {
        plan_id: { type: "string", description: "Identificador do plano aceito." },
      },
      required: ["plan_id"],
      additionalProperties: false,
    },
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: accept_whatsapp_plan_triage(phone, plan_id) + accessLinkInteractiveMessage(url).
    execute: stubExecutorWithArgs("accept_plan"),
  },
  reject_plan: {
    name: "reject_plan",
    description: "Recusa um plano não suportado ou ambíguo, marca a rejeição via RPC e informa o paciente.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          enum: ["unsupported", "ambiguous", "caixa"],
          description: "Motivo da rejeição do plano.",
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: transition_whatsapp_plan_triage("reject", ...) + unsupportedInsurance/caixaInsuranceMessage.
    execute: stubExecutorWithArgs("reject_plan"),
  },
  ask_procedure: {
    name: "ask_procedure",
    description: "Pede ao paciente qual procedimento odontológico ele quer consultar antes de continuar.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: devolver procedurePromptMessage e marcar slot awaiting_procedure=true.
    execute: stubExecutor("ask_procedure"),
  },
  confirm_attendance: {
    name: "confirm_attendance",
    description: "Confirma presença do paciente na próxima consulta marcada, chamando a RPC de confirmação.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: confirm_upcoming_appointment_by_phone + attendanceConfirmationReplyMessage.
    execute: stubExecutor("confirm_attendance"),
  },
  lookup_upcoming_appointment: {
    name: "lookup_upcoming_appointment",
    description: "Consulta a próxima consulta do paciente e devolve o card com link do portal.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: get_upcoming_appointment_by_phone + upcomingAppointmentInteractiveMessage.
    execute: stubExecutor("lookup_upcoming_appointment"),
  },
  handoff: {
    name: "handoff",
    description: "Encaminha a conversa para a equipe humana, limpa os slots e enfileira a notificação de handoff.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: enqueue_human_handoff + clear_whatsapp_conversation_slots(phone); result.handoff=true.
    execute: async () => ({ reply: "__stub__:handoff", handoff: true }),
  },
  greet: {
    name: "greet",
    description: "Envia a saudação inicial com o menu principal (agendar, perguntas, falar com equipe).",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: devolver greetingInteractiveMessage.
    execute: stubExecutor("greet"),
  },
  send_questions_menu: {
    name: "send_questions_menu",
    description: "Envia o menu de planos e procedimentos para o paciente escolher o que quer consultar.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: devolver questionsInteractiveMessage.
    execute: stubExecutor("send_questions_menu"),
  },
  send_unsupported_media_reply: {
    name: "send_unsupported_media_reply",
    description: "Avisa o paciente que áudios e arquivos não podem ser lidos e oferece falar com a equipe.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    // TODO_PR6: devolver unsupportedMediaInteractiveMessage.
    execute: stubExecutor("send_unsupported_media_reply"),
  },
};

/**
 * Module-load sanity check. If a `ToolName` from `router-types.ts` is not
 * registered here, fail loudly with the missing name so the next agent
 * (PR 4/5/6) cannot silently bypass a tool.
 */
const expectedNames = new Set<ToolName>([
  "request_scheduling_link",
  "answer_plan",
  "answer_plan_list",
  "answer_procedure",
  "answer_procedure_list",
  "answer_coverage",
  "answer_child_policy",
  "answer_faq",
  "ask_plan",
  "accept_plan",
  "reject_plan",
  "ask_procedure",
  "confirm_attendance",
  "lookup_upcoming_appointment",
  "handoff",
  "greet",
  "send_questions_menu",
  "send_unsupported_media_reply",
]);
const registeredNames = new Set(Object.keys(ROUTER_TOOLS) as ToolName[]);
for (const name of expectedNames) {
  if (!registeredNames.has(name)) {
    throw new Error(`ROUTER_TOOLS_MISSING:${name}`);
  }
}
for (const name of registeredNames) {
  if (!expectedNames.has(name)) {
    throw new Error(`ROUTER_TOOLS_UNKNOWN:${name}`);
  }
}

/**
 * Allowlist used by the worker before the router executes a tool. Centralised
 * so PR 5 (feature flag) and the shadow observer (PR 4) share the same policy.
 */
export function allowedToolsFor(mode: ToolMode): ToolName[] {
  if (mode === "llm" || mode === "shadow") {
    return ROUTER_TOOL_NAMES.slice();
  }
  return [];
}

/**
 * Validate that an argument bag matches the tool's JSON-schema (lite).
 * PR 3 only confirms the structural envelope; PR 6 fills the real rules.
 * Pure: no RPC, no Evolution, no logging.
 */
export function validateToolArguments(
  name: ToolName,
  args: Record<string, unknown>,
): { valid: boolean; reason?: string } {
  const definition = ROUTER_TOOLS[name];
  if (!definition) return { valid: false, reason: "UNKNOWN_TOOL" };
  if (!args || typeof args !== "object") return { valid: false, reason: "ARG_NOT_OBJECT" };
  for (const requiredKey of definition.parameters.required) {
    if (!(requiredKey in args)) return { valid: false, reason: `MISSING_ARG:${requiredKey}` };
  }
  return { valid: true };
}

/**
 * Pure dispatcher: looks the tool up in the registry and delegates to its
 * `execute`. The worker calls this once per router tool call (max 4 per
 * turn, enforced upstream by `routeWithTools`). Throws `UNKNOWN_TOOL` if
 * the name is not registered — callers must catch and fall back to regex.
 */
export async function executeRouterTool(
  name: ToolName,
  args: Record<string, unknown>,
  ctx: RouterToolContext,
): Promise<RouterToolResult> {
  const definition = ROUTER_TOOLS[name];
  if (!definition) throw new Error(`UNKNOWN_TOOL:${name}`);
  return definition.execute(args, ctx);
}