/**
 * Router tool registry for the LLM-driven WhatsApp triage (PR 3).
 *
 * `ROUTER_TOOLS` enumerates every tool the LLM router is allowed to invoke
 * in a single turn. Each definition pairs the OpenAI-visible schema (the
 * `description` the LLM reads and the JSON-schema `parameters` it must
 * fill) with a typed executor the worker will call once the router decides
 * to fire the tool.
 *
 * PR 7 (current): every executor is wired to the real RPC + template it
 * needs (or to a read-only knowledge lookup). Workers expose the same set
 * of `routerToolContext` fields the regex cascade already uses, so the
 * fallback path stays the source of truth for runtime config.
 *
 * Routing-mode policy:
 * - `llm` and `shadow` allow every tool (the executor is the same; the
 *   observer mode just records the verdict without sending).
 * - `regex_only` and `off` allow nothing — the router is bypassed and the
 *   regex cascade takes over.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvolutionClient } from "@/integrations/evolution/client";
import type { KnowledgeData } from "@/domain/knowledge/service";
import { normalizeKnowledgeTerm } from "@/domain/knowledge/service";
import type { ConversationSlots } from "@/domain/messaging/slots";
import {
  accessLinkInteractiveMessage,
  ambiguousInsuranceMessage,
  attendanceConfirmationReplyMessage,
  caixaInsuranceMessage,
  greetingInteractiveMessage,
  humanFallbackMessage,
  initialInsurancePromptMessage,
  knowledgeAnswerInteractiveMessage,
  knowledgeFallbackMessage,
  procedurePromptMessage,
  questionsInteractiveMessage,
  unsupportedInsuranceMessage,
  unsupportedMediaInteractiveMessage,
  upcomingAppointmentInteractiveMessage,
  verifiedCoverageMessage,
  verifiedPlanListMessage,
  verifiedPlanMessage,
  verifiedProcedureListMessage,
  verifiedProcedureMessage,
  type InteractiveMessage,
} from "@/domain/messaging/templates";
import type { ToolName } from "@/integrations/openai/router-types";
import { createHash, randomBytes } from "node:crypto";
import { encryptOtp, decryptOtp } from "@/lib/messaging/otp-cipher";

/**
 * `off`        — registry disabled; router is bypassed entirely.
 * `shadow`     — LLM observes the patient turn and records the tool it
 *                *would* have called, but the worker still answers with
 *                the regex cascade.
 * `llm`        — LLM decides and its tool calls are executed.
 * `regex_only` — LLM is bypassed (no shadow either). Emergency / rollback
 *                mode used when the OpenAI integration is unavailable.
 */
export type ToolMode = "off" | "shadow" | "llm" | "regex_only";

/**
 * Reusable access link returned by tools that prepare an inbox-bound URL
 * (e.g. `request_scheduling_link`, `accept_plan`). The worker uses this to
 * dedupe RPC calls and to call `mark_whatsapp_access_link_delivered` after
 * the Evolution send succeeds.
 */
export type ToolInboxAccessLink = {
  url: string;
  sourceInboxId: string;
  sentAt: string | null;
};

/** Surface handed to every tool executor. */
export type RouterToolContext = {
  phone: string;
  inboxId: string;
  supabase: SupabaseClient;
  evolution: Pick<EvolutionClient, "sendText" | "sendButtons">;
  knowledge: KnowledgeData;
  slots: ConversationSlots;
  /** AES-GCM secret used to encrypt/decrypt inbox-link OTP tokens. */
  otpSecret: string;
  /** Base URL of the patient portal, used to build inbox access links. */
  portalBaseUrl: string;
};

/**
 * Result of a tool execution.
 *
 * - `reply`           — text or interactive payload the worker should hand
 *                       to `sendReply` after all tools of a turn have run.
 * - `slotWrites`      — optional partial slot merge that the worker will
 *                       pass to `apply_whatsapp_conversation_slots`.
 * - `handoff`         — when true, the worker enqueues a human handoff
 *                       (and clears the conversation slots) via the
 *                       existing RPCs.
 * - `inboxAccessLink`  — when the tool generated a fresh inbox link, the
 *                       worker uses it for `mark_whatsapp_access_link_delivered`.
 */
export type RouterToolResult = {
  reply: string | InteractiveMessage;
  slotWrites?: Partial<ConversationSlots>;
  handoff?: boolean;
  inboxAccessLink?: ToolInboxAccessLink;
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
 * Fallback for tools that look up by id but the LLM hallucinated a name
 * (or the catalog changed). The empathetic microcopy matches what the
 * regex cascade returns — never a bare `__stub__:` string.
 */
function fallbackKnowledgeAnswer(): RouterToolResult {
  return { reply: knowledgeAnswerInteractiveMessage(knowledgeFallbackMessage) };
}

/**
 * Mirror of `worker.createInboxAccessUrl`. Lives here so executors can build
 * a fresh inbox link without depending on the worker's internal method.
 * The returned link is also surfaced through `RouterToolResult.inboxAccessLink`
 * so the worker can call `mark_whatsapp_access_link_delivered` after the
 * Evolution send succeeds.
 */
async function prepareInboxAccessLink(ctx: RouterToolContext): Promise<ToolInboxAccessLink> {
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await ctx.supabase.rpc("prepare_whatsapp_access_link", {
    p_phone: ctx.phone,
    p_source_inbox_id: ctx.inboxId,
    p_token_hash: createHash("sha256").update(token, "utf8").digest("hex"),
    p_encrypted_token: encryptOtp(token, ctx.otpSecret),
  });
  if (error || !data) throw new Error("ACCESS_LINK_PREPARE_FAILED");
  const delivery = data as { encrypted_token?: unknown; phone?: unknown; token_hash?: unknown; expires_at?: unknown; status?: unknown; sent_at?: unknown } | null;
  if (!delivery
    || typeof delivery.encrypted_token !== "string"
    || delivery.phone !== ctx.phone
    || typeof delivery.token_hash !== "string"
    || typeof delivery.expires_at !== "string") throw new Error("ACCESS_LINK_PREPARE_FAILED");
  const reusableToken = decryptOtp(delivery.encrypted_token, ctx.otpSecret);
  if (createHash("sha256").update(reusableToken, "utf8").digest("hex") !== delivery.token_hash) {
    throw new Error("ACCESS_LINK_PREPARE_FAILED");
  }
  return {
    url: `${ctx.portalBaseUrl}/acesso#token=${encodeURIComponent(reusableToken)}`,
    sourceInboxId: ctx.inboxId,
    sentAt: typeof delivery.sent_at === "string" ? delivery.sent_at : null,
  };
}

/**
 * Lightweight variant used by executors that only need the URL string
 * (e.g. embedding it as a button target). Returns just the URL.
 */
async function createInboxAccessUrlForExecutor(ctx: RouterToolContext): Promise<string> {
  return (await prepareInboxAccessLink(ctx)).url;
}

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
 * Full registry. Every entry has a real executor wired to the templates and
 * (where needed) RPCs that match the regex cascade — so when LLM routing is
 * enabled the patient receives the same reply shape as the fallback path.
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
    execute: async (args, ctx) => {
      const kind = args.kind as "schedule" | "reschedule" | "cancel";
      const link = await prepareInboxAccessLink(ctx);
      return {
        reply: accessLinkInteractiveMessage(link.url, kind),
        inboxAccessLink: link,
      };
    },
  },
  answer_plan: {
    name: "answer_plan",
    description: "Responde se um plano odontológico específico é atendido, usando apenas planos ativos no cadastro. Use quando o paciente nomeia explicitamente um único plano e pergunta apenas sobre ele (ex.: 'Vocês atendem SulAmérica?').",
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
    execute: async (args, ctx) => {
      const plan = ctx.knowledge.plans.find((p) => p.id === args.plan_id);
      if (!plan) return fallbackKnowledgeAnswer();
      return {
        reply: knowledgeAnswerInteractiveMessage(verifiedPlanMessage(plan)),
      };
    },
  },
  answer_plan_list: {
    name: "answer_plan_list",
    description: "Lista todos os planos ativos aceitos pela clínica. Use quando o paciente pergunta 'quais planos' / 'vocês aceitam quais' / 'todos os convênios' — devolver a lista é mais útil que o nome de um plano só.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    execute: async (_args, ctx) => ({
      reply: knowledgeAnswerInteractiveMessage(verifiedPlanListMessage(ctx.knowledge.plans)),
    }),
  },
  answer_procedure: {
    name: "answer_procedure",
    description: "Descreve um procedimento odontológico cadastrado, indicando se o agendamento pode iniciar pelo portal. Use quando o paciente cita o nome de um procedimento específico (ex.: 'Limpeza', 'Implante').",
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
    execute: async (args, ctx) => {
      const procedure = ctx.knowledge.procedures.find((p) => p.id === args.procedure_id);
      if (!procedure) return fallbackKnowledgeAnswer();
      const link = procedure.online_booking
        ? { url: await createInboxAccessUrlForExecutor(ctx), sourceInboxId: ctx.inboxId, sentAt: null }
        : undefined;
      const extraButtons: Array<{ type: "url"; displayText: string; url: string }> = link
        ? [{ type: "url", displayText: "Agendar avaliação", url: link.url }]
        : [];
      return {
        reply: knowledgeAnswerInteractiveMessage(verifiedProcedureMessage(procedure), extraButtons),
        ...(link ? { inboxAccessLink: link } : {}),
      };
    },
  },
  answer_procedure_list: {
    name: "answer_procedure_list",
    description: "Lista todos os procedimentos odontológicos cadastrados. Use quando o paciente pede 'quais procedimentos' / 'o que vocês fazem' / lista de serviços.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    execute: async (_args, ctx) => ({
      reply: knowledgeAnswerInteractiveMessage(verifiedProcedureListMessage(ctx.knowledge.procedures)),
    }),
  },
  answer_coverage: {
    name: "answer_coverage",
    description: "Informa se um procedimento está coberto por um plano específico usando apenas a tabela de cobertura. Use quando o paciente cita plano E procedimento juntos (ex.: 'Limpeza cobre Unimed?').",
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
    execute: async (args, ctx) => {
      const plan = ctx.knowledge.plans.find((p) => p.id === args.plan_id);
      const procedure = ctx.knowledge.procedures.find((p) => p.id === args.procedure_id);
      if (!plan || !procedure) return fallbackKnowledgeAnswer();
      const coverage = ctx.knowledge.coverage?.find((entry) => entry.procedure_id === procedure.id && entry.insurance_plan_id === plan.id);
      return {
        reply: knowledgeAnswerInteractiveMessage(verifiedCoverageMessage({
          planName: plan.name,
          procedureName: procedure.name,
          status: coverage ? (coverage.accepted ? "accepted" : "not_covered") : "not_found",
          instructions: coverage?.instructions ?? null,
        })),
      };
    },
  },
  answer_child_policy: {
    name: "answer_child_policy",
    description: "Responde sobre a política de atendimento infantil usando o procedimento cadastrado (ex.: odontopediatria). Use quando o paciente pergunta 'atende criança?' / 'qual a idade mínima'.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    execute: async (_args, ctx) => {
      const policy = ctx.knowledge.procedures.find((entry) => /\b(crianca|criancas|odontopediatria|pediatria)\b/.test(normalizeKnowledgeTerm(entry.name)));
      if (!policy) return fallbackKnowledgeAnswer();
      return {
        reply: knowledgeAnswerInteractiveMessage(verifiedProcedureMessage(policy)),
      };
    },
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
    execute: async (args, ctx) => {
      const faq = ctx.knowledge.faqs.find((entry) => (entry as { id?: string }).id === args.faq_id) ?? ctx.knowledge.faqs.find((_e, idx) => String(idx) === String(args.faq_id));
      // The FAQ catalog does not currently carry an `id` column on `faq_entries`;
      // the LLM router uses the index in `ctx.knowledge.faqs` as the
      // identifier. If the lookup misses, return the empathetic fallback.
      if (!faq) return fallbackKnowledgeAnswer();
      return {
        reply: knowledgeAnswerInteractiveMessage(faq.answer),
      };
    },
  },
  ask_plan: {
    name: "ask_plan",
    description: "Pede ao paciente o nome do plano odontológico antes de continuar o fluxo.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    execute: async (_args, ctx) => ({
      reply: initialInsurancePromptMessage,
      slotWrites: { awaiting_plan: true, prompted_by_inbox_id: ctx.inboxId },
    }),
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
    execute: async (args, ctx) => {
      const planId = args.plan_id as string;
      // The triage session that originated this prompt lives in the slot.
      // The worker populated `prompted_by_inbox_id` when `ask_plan` ran; if
      // it is missing, the LLM should not have called `accept_plan` — refuse
      // to a safe fallback rather than silently letting the RPC fail.
      const promptedByInboxId = ctx.slots.prompted_by_inbox_id;
      if (!promptedByInboxId) {
        return {
          reply: "Antes de confirmar, preciso saber qual plano você quer registrar. Pode me dizer o nome do plano?",
        };
      }
      const { data, error } = await ctx.supabase.rpc("accept_whatsapp_plan_triage", {
        p_phone: ctx.phone,
        p_insurance_plan_id: planId,
        p_prompted_by_inbox_id: promptedByInboxId,
      });
      if (error || data !== true) {
        // Falling back to a soft retry is safer than handing back a generic
        // error — the regex cascade does the same thing.
        return {
          reply: "Não consegui registrar seu plano agora. Vou conectar você com a equipe para confirmar, tá bem?",
          handoff: true,
        };
      }
      const link = await prepareInboxAccessLink(ctx);
      return {
        reply: accessLinkInteractiveMessage(link.url, "schedule"),
        inboxAccessLink: link,
      };
    },
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
    execute: async (args, ctx) => {
      const reason = args.reason as "unsupported" | "ambiguous" | "caixa";
      const promptedByInboxId = ctx.slots.prompted_by_inbox_id;
      if (promptedByInboxId) {
        await ctx.supabase.rpc("transition_whatsapp_plan_triage", {
          p_phone: ctx.phone,
          p_action: "reject",
          p_pending_message: "",
          p_prompted_by_inbox_id: promptedByInboxId,
          p_expected_prompted_by_inbox_id: promptedByInboxId,
        });
      }
      const reply =
        reason === "caixa" ? caixaInsuranceMessage :
        reason === "ambiguous" ? ambiguousInsuranceMessage :
        unsupportedInsuranceMessage;
      return { reply };
    },
  },
  ask_procedure: {
    name: "ask_procedure",
    description: "Pede ao paciente qual procedimento odontológico ele quer consultar antes de continuar.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    execute: async (_args, ctx) => ({
      reply: procedurePromptMessage,
      slotWrites: { awaiting_procedure: true, prompted_by_inbox_id: ctx.inboxId },
    }),
  },
  confirm_attendance: {
    name: "confirm_attendance",
    description: "Confirma presença do paciente na próxima consulta marcada, chamando a RPC de confirmação.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    execute: async (_args, ctx) => {
      const { data, error } = await ctx.supabase.rpc("confirm_upcoming_appointment_by_phone", { p_phone: ctx.phone });
      const result = data as { status?: "confirmed" | "already_confirmed" | "not_found" | "ambiguous"; start_at?: string } | null;
      if (error || !result?.status || !["confirmed", "already_confirmed", "not_found", "ambiguous"].includes(result.status)) {
        throw new Error("APPOINTMENT_CONFIRMATION_FAILED");
      }
      const needsLink = result.status === "not_found" || result.status === "ambiguous";
      const link = needsLink ? await prepareInboxAccessLink(ctx) : undefined;
      const url = link?.url;
      return {
        reply: attendanceConfirmationReplyMessage(result.status, result.start_at, url),
        ...(link ? { inboxAccessLink: link } : {}),
      };
    },
  },
  lookup_upcoming_appointment: {
    name: "lookup_upcoming_appointment",
    description: "Consulta a próxima consulta do paciente e devolve o card com link do portal.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    execute: async (_args, ctx) => {
      const { data, error } = await ctx.supabase.rpc("get_upcoming_appointment_by_phone", { p_phone: ctx.phone });
      const result = data as { status?: "found" | "not_found"; start_at?: string; professional_name?: string } | null;
      if (error || !result?.status || !["found", "not_found"].includes(result.status)) {
        throw new Error("APPOINTMENT_LOOKUP_FAILED");
      }
      const link = await prepareInboxAccessLink(ctx);
      return {
        reply: upcomingAppointmentInteractiveMessage(result.status, link.url, result.start_at, result.professional_name),
        inboxAccessLink: link,
      };
    },
  },
  handoff: {
    name: "handoff",
    description: "Encaminha a conversa para a equipe humana, limpa os slots e enfileira a notificação de handoff.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    execute: async () => ({ reply: humanFallbackMessage, handoff: true }),
  },
  greet: {
    name: "greet",
    description: "Envia a saudação inicial com o menu principal (agendar, perguntas, falar com equipe).",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    execute: async () => ({ reply: greetingInteractiveMessage }),
  },
  send_questions_menu: {
    name: "send_questions_menu",
    description: "Envia o menu de planos e procedimentos para o paciente escolher o que quer consultar.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    execute: async () => ({ reply: questionsInteractiveMessage }),
  },
  send_unsupported_media_reply: {
    name: "send_unsupported_media_reply",
    description: "Avisa o paciente que áudios e arquivos não podem ser lidos e oferece falar com a equipe.",
    parameters: NO_ARGUMENTS,
    requires: { routingMode: LLM_AND_SHADOW },
    execute: async () => ({ reply: unsupportedMediaInteractiveMessage }),
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