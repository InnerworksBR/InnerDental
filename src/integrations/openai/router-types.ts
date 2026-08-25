/**
 * Router types for the LLM-driven WhatsApp triage.
 *
 * The router receives a `RoutingContext` (phone + persistent slots + recent
 * turns + knowledge snapshot) and returns a `RoutingDecision` listing the
 * tools it wants the worker to execute. The 18 names map 1:1 to existing
 * templates and RPCs — see the PR 1 plan for the full mapping table.
 *
 * This module declares only the static shapes (no Zod, no runtime
 * validation). PR 2 introduces `routeWithTools` and adds zod schemas; the
 * split keeps PR 1 free of OpenAI dependencies and prevents PR 2 from having
 * to refactor the base types under it.
 */

import type { KnowledgeData } from "@/domain/knowledge/service.ts";
import type { ConversationSlots } from "@/domain/messaging/slots.ts";

/** Every tool the router is allowed to invoke in a single turn. */
export type ToolName =
  | "request_scheduling_link"
  | "answer_plan"
  | "answer_plan_list"
  | "answer_procedure"
  | "answer_procedure_list"
  | "answer_coverage"
  | "answer_child_policy"
  | "answer_faq"
  | "ask_plan"
  | "accept_plan"
  | "reject_plan"
  | "ask_procedure"
  | "confirm_attendance"
  | "lookup_upcoming_appointment"
  | "handoff"
  | "greet"
  | "send_questions_menu"
  | "send_unsupported_media_reply";

/** A single tool invocation requested by the router. */
export type RoutingToolCall = {
  name: ToolName;
  arguments: Record<string, unknown>;
};

/** The router's verdict for one inbox row: zero or more tool calls in order. */
export type RoutingDecision = {
  calls: RoutingToolCall[];
};

/**
 * Inputs the router needs to make a decision. The `recent_turns` array is
 * kept narrow on purpose — the router only needs to know what was already
 * attempted, not the full message text.
 */
export type RoutingContext = {
  phone: string;
  slots: ConversationSlots;
  recent_turns: Array<{ intent: string | null; action: string | null }>;
  knowledge: KnowledgeData;
};
