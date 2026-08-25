/**
 * Slot model for the LLM-driven WhatsApp triage (PR 1 foundation).
 *
 * `ConversationSlots` captures transient state that survives a single patient
 * turn so the router can resume multi-step flows (plan triage, procedure
 * triage, scheduling window) without losing context. The shape mirrors the
 * columns persisted by `public.whatsapp_conversation_slots` and is read by
 * `read_whatsapp_conversation_slots(phone)` / written by
 * `apply_whatsapp_conversation_slots(phone, slots, prompt_inbox_id)` in
 * migration `202608140030_whatsapp_conversation_slots.sql`.
 *
 * Invariants:
 * - All keys are optional; absence means "no signal".
 * - `phone` is always a normalized BR digit string of length 12–15.
 * - `expires_at` is monotonic; the RPC bumps it but never shrinks it.
 *
 * The allowlist is exported as a runtime constant so validators, tests, and
 * later PRs (router grounding) can refuse unknown keys before they reach
 * Postgres.
 */

/** Allowed top-level keys for `ConversationSlots`. */
export const ALLOWED_SLOT_KEYS = [
  "awaiting_plan",
  "awaiting_procedure",
  "awaiting_window",
  "prompted_by_inbox_id",
  "plan_id",
  "procedure_id",
  "schedule_window",
  "last_tool",
  "updated_at",
] as const;

export type AllowedSlotKey = (typeof ALLOWED_SLOT_KEYS)[number];

/**
 * Snapshot of the persistent state for a phone number. Every field is
 * optional; missing fields mean the patient has not produced that signal.
 *
 * Fields are intentionally narrow so the router can reason about them:
 * - `awaiting_*` flags are set when the worker has just prompted and is
 *   waiting on the next inbound to fill the matching `*_id`.
 * - `prompted_by_inbox_id` anchors optimistic concurrency against the inbox
 *   row that issued the prompt; the worker checks it before reusing slots.
 * - `schedule_window` is the patient's free-form preferred date/time window.
 * - `last_tool` records the tool the router invoked on the previous turn for
 *   observability and disagreement analysis.
 */
export type ConversationSlots = {
  awaiting_plan?: boolean;
  awaiting_procedure?: boolean;
  awaiting_window?: boolean;
  prompted_by_inbox_id?: string;
  plan_id?: string;
  procedure_id?: string;
  schedule_window?: { preferred?: string; earliest?: string; latest?: string };
  last_tool?: string;
  updated_at?: string;
};

/** Sentinel for "no slots stored". Returned by the read RPC when the row has expired. */
export const EMPTY_SLOTS: ConversationSlots = {};

/**
 * Validate the phone shape used everywhere the worker touches a patient
 * identifier. The rule mirrors the SQL `check (phone ~ '^[0-9]{12,15}$')` on
 * every table that stores a phone column, so a value that passes here will
 * not be rejected by the database.
 *
 * @param phone Candidate value, expected to be already normalized (digits only).
 * @returns `true` when the value is a 12–15 digit string.
 */
export function isValidPhone(phone: string): boolean {
  return /^\d{12,15}$/.test(phone);
}
