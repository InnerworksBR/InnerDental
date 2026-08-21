import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { EvolutionClient } from "../src/integrations/evolution/client.ts";
import { decryptOtp, encryptOtp } from "../src/lib/messaging/otp-cipher.ts";
import { classifyIntent, isAccessLinkRequest, isExplicitHumanRequest, isPaymentQuestion, isProcedureBookingRequest, type MessageIntent } from "../src/domain/messaging/intent.ts";
import { whatsappMessageFingerprint } from "../src/domain/messaging/fingerprint.ts";
import { handoffNotificationMessage, handoffReason } from "../src/domain/messaging/handoff.ts";
import {
  accessLinkInteractiveMessage,
  appointmentConfirmationRequestInteractiveMessage,
  appointmentInteractiveMessage,
  ambiguousInsuranceMessage,
  attendanceConfirmationReplyMessage,
  upcomingAppointmentInteractiveMessage,
  dailyConfirmationSummaryMessage,
  greetingInteractiveMessage,
  humanFallbackMessage,
  initialInsurancePromptMessage,
  insurancePromptMessage,
  knowledgeFallbackMessage,
  knowledgeAnswerInteractiveMessage,
  menuActions,
  otpMessage,
  procedureInsurancePromptMessage,
  procedurePromptMessage,
  priceConfirmationMessage,
  questionsInteractiveMessage,
  unsupportedMediaInteractiveMessage,
  treatmentStatusHandoffMessage,
  verifiedCoverageMessage,
  verifiedPlanListMessage,
  verifiedPlanMessage,
  verifiedProcedureListMessage,
  verifiedProcedureMessage,
  type InteractiveMessage,
  type DailyConfirmationSummary,
} from "../src/domain/messaging/templates.ts";
import { findRequestedProcedure, isExplicitInsurancePlanAnswer, isParticularPlan, triageInsurancePlan, type KnowledgeData } from "../src/domain/knowledge/service.ts";
import { resolveVerifiedFacts } from "../src/domain/knowledge/verified-facts.ts";
import { generateClinicReply } from "../src/integrations/openai/chat.ts";
import { isCorrelationId, log } from "../src/lib/observability/logger.ts";
import { incrementCounter, renderPrometheusMetrics, setGauge } from "../src/lib/observability/metrics.ts";
import { normalizeBrazilianPhone } from "../src/lib/phone/normalize.ts";
import {
  GoogleServiceAccountAuth,
  readGoogleServiceAccountCredentials,
  type GoogleServiceAccountCredentials,
} from "../src/integrations/google-calendar/service-account-auth.ts";
import { syncDirectCalendarAppointments } from "./calendar-sync.ts";

type OutboxRow = { id: string; aggregate_id: string; event_type: string; attempts: number; lease_token?: string; payload?: { correlation_id?: unknown; scheduled_start_at?: unknown; summary_date?: unknown } };
type InboxRow = { id: string; phone: string; message_text: string; attempts: number; lease_token?: string };
type PlanTriageSession = {
  status: "awaiting_plan" | "accepted" | "rejected";
  pending_message: string;
  prompted_by_inbox_id: string;
  insurance_plan_id?: string | null;
  accepted_by_inbox_id?: string | null;
  expires_at: string;
};
type PlanTriageDecision =
  | { kind: "continue" }
  | { kind: "resume"; message: string; planId: string; promptedByInboxId: string }
  | { kind: "reply"; message: string; action: "plan_requested" | "plan_rejected" | "plan_rejected_caixa" };
type PreparedInboxAccessLink = { url: string; sourceInboxId: string; sentAt: string | null };
type RecipientPolicy = "all" | "allowlist";
type Config = { supabaseUrl: string; supabaseKey: string; evolutionBaseUrl: string; evolutionApiKey: string; evolutionInstance: string; otpSecret: string; portalBaseUrl: string; handoffNotificationPhone: string; dailySummaryHour?: number; googleCredentials?: GoogleServiceAccountCredentials; googleCalendarId?: string; calendarSyncIntervalMs?: number; openaiApiKey?: string; openaiModel: string; interactiveMessages?: boolean; recipientPolicy?: RecipientPolicy; pollMs: number; healthPort: number; workerId?: string; concurrency?: number; leaseSeconds?: number; allowedRecipients?: string[]; humanTakeoverPauseMinutes?: number; planTriageEnabled?: boolean };

const WHATSAPP_ACCESS_LINK_TTL_MS = 24 * 60 * 60_000;

function verifiedFactSource(resolution: ReturnType<typeof resolveVerifiedFacts> | undefined) {
  if (resolution?.kind !== "resolved") return "none";
  if (resolution.facts.coverage) return "coverage";
  if (resolution.facts.plan || resolution.facts.planList) return "plan";
  if (resolution.facts.procedure || resolution.facts.procedureList) return "procedure";
  if (resolution.facts.childPolicy) return "child_policy";
  if (resolution.facts.faq) return "faq";
  return "none";
}

function required(name: string) { const value = process.env[name]?.trim(); if (!value) throw new Error(`Missing ${name}`); return value; }
function booleanSetting(name: string, fallback = false) { const value = process.env[name]?.trim().toLowerCase(); if (!value) return fallback; if (value === "true") return true; if (value === "false") return false; throw new Error(`${name}_INVALID`); }
export function loadWorkerConfig(): Config {
  const otpSecret = required("OTP_ENCRYPTION_SECRET");
  if (otpSecret.length < 32) throw new Error("OTP_ENCRYPTION_SECRET_INVALID");
  const portal = new URL(required("PORTAL_BASE_URL"));
  if (!["http:", "https:"].includes(portal.protocol)) throw new Error("PORTAL_BASE_URL_INVALID");
  if (process.env.NODE_ENV === "production" && (portal.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(portal.hostname))) throw new Error("PORTAL_BASE_URL_NOT_PUBLIC");
  const pollMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 2000);
  const healthPort = Number(process.env.WORKER_HEALTH_PORT ?? 3001);
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);
  const leaseSeconds = Number(process.env.WORKER_LEASE_SECONDS ?? 300);
  const dailySummaryHour = Number(process.env.WORKER_DAILY_SUMMARY_HOUR ?? 8);
  const calendarSyncIntervalMs = Number(process.env.WORKER_CALENDAR_SYNC_INTERVAL_MS ?? 60_000);
  const googleCredentials = readGoogleServiceAccountCredentials();
  const recipientPolicy = required("WORKER_RECIPIENT_POLICY") as RecipientPolicy;
  if (!["all", "allowlist"].includes(recipientPolicy)) throw new Error("WORKER_RECIPIENT_POLICY_INVALID");
  const allowedRecipients = (process.env.WORKER_ALLOWED_RECIPIENTS ?? "").split(",").map((phone) => phone.trim()).filter(Boolean).map(normalizeBrazilianPhone);
  if (recipientPolicy === "allowlist" && allowedRecipients.length === 0) throw new Error("WORKER_ALLOWED_RECIPIENTS_REQUIRED");
  let handoffNotificationPhone: string;
  try { handoffNotificationPhone = normalizeBrazilianPhone(required("HANDOFF_NOTIFICATION_PHONE")); }
  catch { throw new Error("HANDOFF_NOTIFICATION_PHONE_INVALID"); }
  if (!Number.isFinite(pollMs) || pollMs < 250 || !Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65535 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20 || !Number.isInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 900) throw new Error("WORKER_INTERVAL_OR_PORT_INVALID");
  if (!Number.isInteger(dailySummaryHour) || dailySummaryHour < 0 || dailySummaryHour > 23) throw new Error("WORKER_DAILY_SUMMARY_HOUR_INVALID");
  if (!Number.isInteger(calendarSyncIntervalMs) || calendarSyncIntervalMs < 15_000 || calendarSyncIntervalMs > 3_600_000) throw new Error("WORKER_CALENDAR_SYNC_INTERVAL_MS_INVALID");
  return { supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"), supabaseKey: required("SUPABASE_SECRET_KEY"), evolutionBaseUrl: required("EVOLUTION_BASE_URL"), evolutionApiKey: required("EVOLUTION_API_KEY"), evolutionInstance: required("EVOLUTION_INSTANCE"), otpSecret, portalBaseUrl: portal.toString().replace(/\/$/, ""), handoffNotificationPhone, dailySummaryHour, googleCredentials, googleCalendarId: process.env.GOOGLE_CALENDAR_ID?.trim() || undefined, calendarSyncIntervalMs, openaiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined, openaiModel: process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini", interactiveMessages: booleanSetting("EVOLUTION_INTERACTIVE_MESSAGES"), recipientPolicy, pollMs, healthPort, workerId: process.env.WORKER_ID?.trim() || `worker-${randomUUID()}`, concurrency, leaseSeconds, allowedRecipients: [...new Set(allowedRecipients)], humanTakeoverPauseMinutes: 120, planTriageEnabled: true };
}
const opaqueToken = () => randomBytes(32).toString("base64url");
const tokenHash = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
const retryAt = (attempts: number) => new Date(Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6))).toISOString();

export class MessagingWorker {
  private stopped = false; private lastPoll = Date.now(); private lastQueueHealthAt = 0; private pollNumber = 0;
  private lastCalendarSyncAt = 0; private calendarSyncHealthy = true;
  private readonly calendarAuth?: GoogleServiceAccountAuth;
  private readonly db: SupabaseClient; private readonly evolution: EvolutionClient; private readonly config: Config;
  constructor(db: SupabaseClient, evolution: EvolutionClient, config: Config) {
    this.db = db;
    this.evolution = evolution;
    this.config = {
      ...config,
      workerId: config.workerId ?? `worker-${randomUUID()}`,
      concurrency: config.concurrency ?? 5,
      leaseSeconds: config.leaseSeconds ?? 300,
      interactiveMessages: config.interactiveMessages ?? false,
      recipientPolicy: config.recipientPolicy ?? "allowlist",
      calendarSyncIntervalMs: config.calendarSyncIntervalMs ?? 60_000,
      planTriageEnabled: config.planTriageEnabled ?? false,
    };
    this.calendarAuth = config.googleCredentials ? new GoogleServiceAccountAuth(config.googleCredentials) : undefined;
  }
  private recipientAllowed(phone: string) { return this.config.recipientPolicy === "all" || (this.config.allowedRecipients ?? []).includes(phone); }
  async tick() {
    if (this.stopped) return;
    const startedAt = Date.now();
    const pollNumber = ++this.pollNumber;
    log("debug", "worker_poll_started", { pollNumber });
    if (this.calendarAuth && Date.now() - this.lastCalendarSyncAt >= this.config.calendarSyncIntervalMs!) {
      this.lastCalendarSyncAt = Date.now();
      try {
        const calendarSync = await syncDirectCalendarAppointments({ db: this.db, getAccessToken: () => this.calendarAuth!.getAccessToken(), fallbackCalendarId: this.config.googleCalendarId });
        this.calendarSyncHealthy = true;
        setGauge("luna_calendar_sync_healthy", "Whether the latest direct Calendar sync succeeded.", {}, 1);
        log("info", "direct_calendar_sync_completed", calendarSync);
      } catch (error) {
        this.calendarSyncHealthy = false;
        setGauge("luna_calendar_sync_healthy", "Whether the latest direct Calendar sync succeeded.", {}, 0);
        incrementCounter("luna_worker_failures_total", "Worker processing failures.", { queue: "calendar_sync" });
        log("error", "direct_calendar_sync_failed", { error });
      }
    }
    const [summarySchedule, otpPurge] = await Promise.all([
      this.calendarSyncHealthy ? this.db.rpc("enqueue_daily_confirmation_summary", { p_summary_hour: this.config.dailySummaryHour ?? 8 }) : Promise.resolve({ data: null, error: null }),
      this.db.rpc("purge_expired_otp_delivery_secrets"),
    ]);
    if (summarySchedule.error || otpPurge.error) {
      log("error", "worker_housekeeping_rpc_failed", { summaryRpcStatus: summarySchedule.error?.code ?? null, otpRpcStatus: otpPurge.error?.code ?? null, migration: "202607270017_direct_calendar_appointments.sql" });
      throw new Error("WORKER_HOUSEKEEPING_FAILED");
    }
    if (this.stopped) return;
    const args = { batch_size: 10, worker_id: this.config.workerId!, lease_seconds: this.config.leaseSeconds! };
    const shouldRefreshHealth = Date.now() - this.lastQueueHealthAt >= 30_000;
    const [outbox, inbox, health] = await Promise.all([this.db.rpc("claim_notification_outbox_leased", args), this.db.rpc("claim_whatsapp_inbox_leased", args), shouldRefreshHealth ? this.db.rpc("message_queue_health") : Promise.resolve({ data: null, error: null })]);
    if (outbox.error || inbox.error) {
      const failures = [
        outbox.error ? { queue: "outbox", rpcStatus: outbox.error.code ?? "UNKNOWN" } : null,
        inbox.error ? { queue: "inbox", rpcStatus: inbox.error.code ?? "UNKNOWN" } : null,
      ].filter((failure): failure is { queue: string; rpcStatus: string } => failure !== null);
      log("error", "worker_claim_rpc_failed", { failures, migration: "202607230012_message_leases.sql" });
      if (failures.some(({ rpcStatus }) => rpcStatus === "PGRST202")) throw new Error("MESSAGE_LEASE_MIGRATION_REQUIRED");
      throw new Error("CLAIM_FAILED");
    }
    const claimedOutbox = outbox.data as OutboxRow[] ?? []; const claimedInbox = inbox.data as InboxRow[] ?? [];
    log("info", "worker_messages_claimed", { pollNumber, outbox: claimedOutbox.length, inbox: claimedInbox.length });
    incrementCounter("luna_worker_claims_total", "Messages claimed by the worker.", { queue: "outbox" }, claimedOutbox.length);
    incrementCounter("luna_worker_claims_total", "Messages claimed by the worker.", { queue: "inbox" }, claimedInbox.length);
    const queue = health.data as Record<string, number> | null;
    if (!health.error && queue) { for (const [name, value] of Object.entries(queue)) setGauge(`luna_queue_${name}`, "Current message queue health.", {}, Number(value)); this.lastQueueHealthAt = Date.now(); }
    await this.processLimited(claimedOutbox, (row) => this.processOutbox(row));
    await this.processLimited(claimedInbox, (row) => this.processInbox(row));
    this.lastPoll = Date.now();
    log("info", "worker_poll_completed", { pollNumber, outbox: claimedOutbox.length, inbox: claimedInbox.length, durationMs: this.lastPoll - startedAt });
  }
  private async processLimited<T>(rows: T[], action: (row: T) => Promise<void>) {
    for (let offset = 0; offset < rows.length; offset += this.config.concurrency!) await Promise.all(rows.slice(offset, offset + this.config.concurrency!).map(action));
  }
  private async updateOrThrow(table: "notification_outbox" | "whatsapp_inbox", id: string, values: Record<string, unknown>, leaseToken?: string) {
    if (leaseToken) {
      const result = table === "notification_outbox"
        ? await this.db.rpc("finish_notification_outbox_leased", {
          message_id: id, claimed_token: leaseToken, final_status: values.status,
          error_code: values.last_error ?? null, retry_at: values.available_at ?? null,
          dead_letter: Boolean(values.dead_lettered_at),
        })
        : await this.db.rpc("finish_whatsapp_inbox_leased", {
          message_id: id, claimed_token: leaseToken, final_status: values.status,
          error_code: values.last_error ?? null, retry_at: values.available_at ?? null,
          intent: values.classified_intent ?? null, action: values.processed_action ?? null,
          dead_letter: Boolean(values.dead_lettered_at),
        });
      if (result.error || result.data !== true) {
        log("error", "worker_lease_finalize_failed", { queue: table, rpcStatus: result.error?.code ?? "LEASE_NOT_OWNED" });
        throw new Error(`${table.toUpperCase()}_STATE_UPDATE_FAILED`);
      }
      return;
    }
    const result = await this.db.from(table).update(values).eq("id", id);
    if (result.error) throw new Error(`${table.toUpperCase()}_STATE_UPDATE_FAILED`);
  }
  private correlationId(row: OutboxRow | InboxRow) { return "payload" in row && isCorrelationId(row.payload?.correlation_id) ? row.payload.correlation_id : row.id; }
  async processOutbox(row: OutboxRow) {
    const startedAt = Date.now();
    log("debug", "outbox_processing_started", { correlationId: this.correlationId(row), eventType: row.event_type, attempts: row.attempts });
    try {
      if (row.event_type === "auth.otp_requested") await this.sendOtp(row);
      else if (["appointment.created", "appointment.rescheduled", "appointment.cancelled", "appointment.reminder"].includes(row.event_type)) await this.sendAppointment(row);
      else if (row.event_type === "appointment.confirmation_requested") await this.sendAppointmentConfirmationRequest(row);
      else if (row.event_type === "clinic.daily_confirmation_summary") await this.sendDailyConfirmationSummary(row);
      else if (row.event_type === "human_handoff.created") await this.sendHandoffNotification(row);
      else {
        await this.updateOrThrow("notification_outbox", row.id, { status: "sent", sent_at: new Date().toISOString(), last_error: "unsupported_event" }, row.lease_token);
        log("warn", "unsupported_outbox_event_discarded", { correlationId: this.correlationId(row), eventType: row.event_type });
        return;
      }
      await this.updateOrThrow("notification_outbox", row.id, { status: "sent", sent_at: new Date().toISOString(), last_error: null }, row.lease_token);
      incrementCounter("luna_worker_messages_total", "Messages processed by the worker.", { queue: "outbox", result: "sent" });
      log("info", "outbox_message_sent", { correlationId: this.correlationId(row), eventType: row.event_type, attempts: row.attempts, durationMs: Date.now() - startedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : "delivery_failed";
      if (message === "RECIPIENT_NOT_ALLOWED") {
        await this.updateOrThrow("notification_outbox", row.id, { status: "sent", sent_at: new Date().toISOString(), last_error: "recipient_not_allowed" }, row.lease_token);
        log("warn", "outbox_recipient_blocked", { correlationId: this.correlationId(row), eventType: row.event_type });
        return;
      }
      if (message === "STALE_CONFIRMATION_REQUEST") {
        await this.updateOrThrow("notification_outbox", row.id, { status: "sent", sent_at: new Date().toISOString(), last_error: "stale_schedule" }, row.lease_token);
        log("info", "stale_confirmation_request_discarded", { correlationId: this.correlationId(row) });
        return;
      }
      if (message === "OTP_EXPIRED") {
        await this.updateOrThrow("notification_outbox", row.id, { status: "sent", sent_at: new Date().toISOString(), last_error: "otp_expired" }, row.lease_token);
        log("info", "expired_otp_discarded", { correlationId: this.correlationId(row), attempts: row.attempts });
        return;
      }
      incrementCounter("luna_worker_failures_total", "Worker processing failures.", { queue: "outbox" });
      log("error", "outbox_delivery_failed", { correlationId: this.correlationId(row), eventType: row.event_type, attempts: row.attempts, error });
      const deadLetter = row.attempts >= 6;
      if (deadLetter) incrementCounter("luna_worker_dead_letters_total", "Messages moved to dead-letter.", { queue: "outbox" });
      else incrementCounter("luna_worker_retries_total", "Messages scheduled for retry.", { queue: "outbox" });
      await this.updateOrThrow("notification_outbox", row.id, { status: "failed", available_at: retryAt(row.attempts), last_error: deadLetter ? "max_attempts_exceeded" : "delivery_failed", dead_lettered_at: deadLetter ? new Date().toISOString() : null }, row.lease_token);
    }
  }
  private async markBotOutbound(phone: string, text: string) {
    if (!this.config.humanTakeoverPauseMinutes) return;
    const { error } = await this.db.from("whatsapp_bot_outbound_markers").insert({ phone, message_fingerprint: whatsappMessageFingerprint(phone, text), expires_at: new Date(Date.now() + 5 * 60_000).toISOString() });
    if (error) throw new Error("BOT_OUTBOUND_MARKER_FAILED");
  }
  private async sendBotText(phone: string, text: string) { await this.markBotOutbound(phone, text); await this.evolution.sendText(phone, text); }
  private async sendBotButtons(phone: string, reply: InteractiveMessage) { await this.markBotOutbound(phone, reply.description); await this.evolution.sendButtons(phone, reply); }
  private async sendOtp(row: OutboxRow) { const [{ data: access }, { data: delivery }] = await Promise.all([this.db.from("access_tokens").select("phone,expires_at,status").eq("id", row.aggregate_id).single(), this.db.from("otp_delivery_secrets").select("encrypted_code").eq("access_token_id", row.aggregate_id).single()]); if (!access || access.status !== "active" || new Date(access.expires_at) <= new Date()) throw new Error("OTP_EXPIRED"); if (!this.recipientAllowed(access.phone)) throw new Error("RECIPIENT_NOT_ALLOWED"); if (!delivery) throw new Error("OTP_NOT_READY"); await this.sendBotText(access.phone, otpMessage(decryptOtp(delivery.encrypted_code, this.config.otpSecret))); const { error } = await this.db.from("otp_delivery_secrets").delete().eq("access_token_id", row.aggregate_id); if (error) throw new Error("OTP_SECRET_DELETE_FAILED"); }
  private async sendReply(phone: string, reply: string | InteractiveMessage) {
    if (typeof reply === "string") { await this.sendBotText(phone, reply); return; }
    if (this.config.interactiveMessages) {
      try {
        await this.sendBotButtons(phone, reply);
        return;
      } catch (error) {
        log("warn", "interactive_message_fallback", { error });
      }
    }
    await this.sendBotText(phone, reply.fallbackText);
  }
  private async sendAppointment(row: OutboxRow) {
    const { data } = await this.db.from("appointments").select("start_at,patients(phone),professionals(name)").eq("id", row.aggregate_id).single();
    const patient = Array.isArray(data?.patients) ? data.patients[0] : data?.patients;
    const professional = Array.isArray(data?.professionals) ? data.professionals[0] : data?.professionals;
    if (!data || !patient?.phone) throw new Error("APPOINTMENT_NOT_FOUND");
    if (!this.recipientAllowed(patient.phone)) throw new Error("RECIPIENT_NOT_ALLOWED");
    const accessUrl = await this.createAccessUrl(patient.phone);
    await this.sendReply(patient.phone, appointmentInteractiveMessage(row.event_type, data.start_at, accessUrl, professional?.name));
  }
  private async sendAppointmentConfirmationRequest(row: OutboxRow) {
    const { data, error } = await this.db.from("appointments").select("start_at,status,patients(phone),professionals(name)").eq("id", row.aggregate_id).single();
    const patient = Array.isArray(data?.patients) ? data.patients[0] : data?.patients;
    const professional = Array.isArray(data?.professionals) ? data.professionals[0] : data?.professionals;
    const expectedStart = typeof row.payload?.scheduled_start_at === "string" ? new Date(row.payload.scheduled_start_at) : null;
    if (error || !data || !patient?.phone || !expectedStart || Number.isNaN(expectedStart.getTime()) || !["scheduled", "rescheduled"].includes(data.status) || expectedStart.getTime() !== new Date(data.start_at).getTime() || new Date(data.start_at) <= new Date()) throw new Error("STALE_CONFIRMATION_REQUEST");
    if (!this.recipientAllowed(patient.phone)) throw new Error("RECIPIENT_NOT_ALLOWED");
    const accessUrl = await this.createAccessUrl(patient.phone);
    await this.sendReply(patient.phone, appointmentConfirmationRequestInteractiveMessage(data.start_at, accessUrl, professional?.name));
    const update = await this.db.from("appointments").update({ attendance_confirmation_requested_at: new Date().toISOString() }).eq("id", row.aggregate_id).eq("start_at", data.start_at);
    if (update.error) throw new Error("CONFIRMATION_REQUEST_STATE_FAILED");
  }
  private async sendDailyConfirmationSummary(row: OutboxRow) {
    const summaryDate = typeof row.payload?.summary_date === "string" ? row.payload.summary_date : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(summaryDate)) throw new Error("DAILY_SUMMARY_DATE_INVALID");
    const { data, error } = await this.db.rpc("get_daily_confirmation_summary", { p_summary_date: summaryDate });
    const summary = data as DailyConfirmationSummary | null;
    if (error || !summary || !Number.isInteger(summary.total) || !Number.isInteger(summary.confirmed) || !Array.isArray(summary.unconfirmed)) throw new Error("DAILY_SUMMARY_LOOKUP_FAILED");
    await this.sendBotText(this.config.handoffNotificationPhone, dailyConfirmationSummaryMessage(summary));
  }
  private async sendHandoffNotification(row: OutboxRow) {
    const { data: handoff, error: handoffError } = await this.db.from("human_handoffs").select("phone,reason").eq("id", row.aggregate_id).single();
    if (handoffError || !handoff?.phone || !handoff?.reason) throw new Error("HANDOFF_NOT_FOUND");
    const { data: patient, error: patientError } = await this.db.from("patients").select("name").eq("phone", handoff.phone).maybeSingle();
    if (patientError) throw new Error("HANDOFF_PATIENT_LOOKUP_FAILED");
    await this.sendBotText(this.config.handoffNotificationPhone, handoffNotificationMessage({ patientName: patient?.name ?? null, patientPhone: handoff.phone, reason: handoff.reason }));
  }
  private async transitionPlanTriage(phone: string, action: "begin" | "replace" | "reject" | "expire", pendingMessage: string, promptedByInboxId: string, expectedPromptedByInboxId?: string) {
    const { data, error } = await this.db.rpc("transition_whatsapp_plan_triage", {
      p_phone: phone,
      p_action: action,
      p_pending_message: pendingMessage,
      p_prompted_by_inbox_id: promptedByInboxId,
      p_expected_prompted_by_inbox_id: expectedPromptedByInboxId ?? null,
    });
    if (error) throw new Error("PLAN_TRIAGE_STATE_FAILED");
    if (typeof data === "boolean") return data;
    throw new Error("PLAN_TRIAGE_STATE_FAILED");
  }
  private requiresPlanTriage(intent: MessageIntent, message: string) {
    return !isPaymentQuestion(message)
      && ((intent === "schedule" && !isAccessLinkRequest(message)) || intent === "procedure");
  }
  private async patientHasActivePlan(phone: string) {
    return Boolean(await this.patientActivePlanId(phone));
  }
  private async patientActivePlanId(phone: string): Promise<string | null> {
    const { data: patient, error: patientError } = await this.db.from("patients").select("insurance_plan_id").eq("phone", phone).maybeSingle();
    if (patientError) throw new Error("PATIENT_PLAN_LOOKUP_FAILED");
    const planId = (patient as { insurance_plan_id?: string | null } | null)?.insurance_plan_id;
    if (!planId) return null;
    const { data: plan, error: planError } = await this.db.from("insurance_plans").select("name,active").eq("id", planId).maybeSingle();
    if (planError) throw new Error("PATIENT_PLAN_LOOKUP_FAILED");
    return (plan as { active?: boolean } | null)?.active ? planId : null;
  }
  private async preparePlanTriage(row: InboxRow, intent: MessageIntent, message: string): Promise<PlanTriageDecision> {
    if (!this.config.planTriageEnabled) return { kind: "continue" };
    const { data, error } = await this.db.from("whatsapp_plan_triage_sessions")
      .select("status,pending_message,prompted_by_inbox_id,insurance_plan_id,accepted_by_inbox_id,expires_at")
      .eq("phone", row.phone)
      .maybeSingle();
    if (error) throw new Error("PLAN_TRIAGE_LOOKUP_FAILED");
    const session = data as PlanTriageSession | null;
    const activeSession = session && new Date(session.expires_at).getTime() > Date.now() ? session : null;

    if (activeSession?.status === "accepted") {
      // Only a retry of the inbox that answered this exact prompt can restore
      // the original scheduling request. A later message is a new turn.
      if (activeSession.accepted_by_inbox_id === row.id && activeSession.insurance_plan_id) {
        return {
          kind: "resume",
          message: activeSession.pending_message,
          planId: activeSession.insurance_plan_id,
          promptedByInboxId: activeSession.prompted_by_inbox_id,
        };
      }
      return { kind: "continue" };
    }
    if (activeSession?.status === "awaiting_plan" && activeSession.prompted_by_inbox_id === row.id) {
      return { kind: "reply", message: initialInsurancePromptMessage, action: "plan_requested" };
    }

    if (activeSession && ["awaiting_plan", "rejected"].includes(activeSession.status)) {
      const knowledge = await this.loadKnowledge();
      const result = triageInsurancePlan(message, knowledge);
      if (result.kind === "accepted" && isExplicitInsurancePlanAnswer(message, knowledge)) {
        return {
          kind: "resume",
          message: activeSession.pending_message,
          planId: result.plan.id,
          promptedByInboxId: activeSession.prompted_by_inbox_id,
        };
      }
      // Any non-direct response, including a question that names a valid plan, ends
      // the pending triage so the current intent cannot be hijacked by old state.
      const rejected = await this.transitionPlanTriage(row.phone, "reject", activeSession.pending_message, activeSession.prompted_by_inbox_id, activeSession.prompted_by_inbox_id);
      if (!rejected) throw new Error("PLAN_TRIAGE_CONCURRENT_CHANGE");
    }

    if (!this.requiresPlanTriage(intent, message)) return { kind: "continue" };
    if (await this.patientHasActivePlan(row.phone)) return { kind: "continue" };
    const knowledge = await this.loadKnowledge();
    const initialPlan = triageInsurancePlan(message, knowledge);
    if (initialPlan.kind === "ambiguous") return { kind: "reply", message: ambiguousInsuranceMessage, action: "plan_requested" };
    if (initialPlan.kind === "accepted") {
      // The acceptance RPC validates a durable, current prompt. A patient who
      // states the plan in the first scheduling message therefore receives the
      // same pending state as a prompted reply, before any profile write.
      if (!await this.transitionPlanTriage(row.phone, "replace", message, row.id, session?.prompted_by_inbox_id)) {
        throw new Error("PLAN_TRIAGE_CONCURRENT_CHANGE");
      }
      return { kind: "resume", message, planId: initialPlan.plan.id, promptedByInboxId: row.id };
    }
    let prompt = initialInsurancePromptMessage;
    if (intent === "procedure") {
      const requestedProcedure = findRequestedProcedure(message, knowledge);
      if (!requestedProcedure?.online_booking) return { kind: "continue" };
      prompt = procedureInsurancePromptMessage(requestedProcedure.name);
    }
    if (!await this.transitionPlanTriage(row.phone, "replace", message, row.id, session?.prompted_by_inbox_id)) {
      throw new Error("PLAN_TRIAGE_CONCURRENT_CHANGE");
    }
    return { kind: "reply", message: prompt, action: "plan_requested" };
  }
  private async acceptPlanTriage(phone: string, planId: string, promptedByInboxId: string, answerInboxId: string) {
    // The RPC writes the patient profile and accepted triage session in one
    // database transaction. Sending a portal link after two independent
    // upserts could otherwise strand a patient in an accepted session.
    const { data, error } = await this.db.rpc("accept_whatsapp_plan_triage", {
      p_phone: phone,
      p_insurance_plan_id: planId,
      p_prompted_by_inbox_id: promptedByInboxId,
      p_answer_inbox_id: answerInboxId,
    });
    if (error || data !== true) throw new Error("PLAN_TRIAGE_ACCEPTANCE_FAILED");
  }
  private async ignoreIfConversationPaused(row: InboxRow, intent: MessageIntent) {
    if (!this.config.humanTakeoverPauseMinutes) return false;
    const { data, error } = await this.db.rpc("is_whatsapp_conversation_paused", { p_phone: row.phone });
    if (error) throw new Error("CONVERSATION_PAUSE_LOOKUP_FAILED");
    if (data !== true) return false;
    await this.updateOrThrow("whatsapp_inbox", row.id, { status: "processed", processed_at: new Date().toISOString(), last_error: "agent_paused", classified_intent: intent, processed_action: "ignored" }, row.lease_token);
    log("info", "inbox_ignored_during_human_takeover", { correlationId: row.id });
    return true;
  }
  private async loadConversationContext(phone: string, currentId: string) {
    try {
      const { data, error } = await this.db.from("whatsapp_inbox")
        .select("classified_intent,processed_action")
        .eq("phone", phone)
        .neq("id", currentId)
        .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) return [];
      return ((data ?? []) as Array<{ classified_intent: string | null; processed_action: string | null }>)
        .reverse()
        .map((entry) => ({ intent: entry.classified_intent, action: entry.processed_action }));
    } catch {
      return [];
    }
  }
  async processInbox(row: InboxRow) {
    const startedAt = Date.now();
    let messageText = row.message_text;
    let intent = classifyIntent(messageText);
    let preparedInboxLink: PreparedInboxAccessLink | undefined;
    const inboxAccessUrl = async () => {
      preparedInboxLink ??= await this.createInboxAccessUrl(row.phone, row.id);
      return preparedInboxLink.url;
    };
    log("debug", "inbox_processing_started", { correlationId: row.id, intent, attempts: row.attempts });
    if (!this.recipientAllowed(row.phone)) {
      await this.updateOrThrow("whatsapp_inbox", row.id, { status: "processed", processed_at: new Date().toISOString(), last_error: "recipient_not_allowed", classified_intent: intent, processed_action: "ignored" }, row.lease_token);
      log("warn", "inbox_recipient_blocked", { correlationId: row.id });
      incrementCounter("luna_worker_messages_blocked_total", "Messages blocked by the worker recipient allowlist.", { queue: "inbox" });
      return;
    }
    if (row.attempts > 5) {
      await this.updateOrThrow("whatsapp_inbox", row.id, { status: "processed", processed_at: new Date().toISOString(), last_error: "max_attempts_exceeded", classified_intent: intent, processed_action: "ignored", dead_lettered_at: new Date().toISOString() }, row.lease_token);
      incrementCounter("luna_worker_dead_letters_total", "Messages moved to dead-letter.", { queue: "inbox" });
      log("error", "inbox_dead_lettered", { correlationId: row.id, attempts: row.attempts });
      incrementCounter("luna_worker_failures_total", "Worker processing failures.", { queue: "inbox", result: "dead_lettered" });
      return;
    }
    try {
      if (await this.ignoreIfConversationPaused(row, intent)) return;
      const triage = await this.preparePlanTriage(row, intent, messageText);
      if (triage.kind === "reply") {
        if (await this.ignoreIfConversationPaused(row, intent)) return;
        await this.sendReply(row.phone, triage.message);
        await this.updateOrThrow("whatsapp_inbox", row.id, { status: "processed", processed_at: new Date().toISOString(), last_error: null, classified_intent: intent, processed_action: triage.action }, row.lease_token);
        incrementCounter("luna_worker_messages_total", "Messages processed by the worker.", { queue: "inbox", result: triage.action });
        log("info", "inbox_plan_triage_processed", { correlationId: row.id, action: triage.action, attempts: row.attempts, durationMs: Date.now() - startedAt });
        return;
      }
      const acceptedPlan = triage.kind === "resume"
        ? { id: triage.planId, pendingMessage: triage.message, promptedByInboxId: triage.promptedByInboxId }
        : null;
      if (triage.kind === "resume") {
        messageText = triage.message;
        intent = classifyIntent(messageText);
        // Persist the selected canonical plan and patient context before any
        // outbound reply, including the first-class `Particular` plan record.
        // Exact replay is intentionally sent through the same RPC: it locks
        // and revalidates the accepted patient profile and active plan before
        // the worker can recreate a portal response.
        await this.acceptPlanTriage(row.phone, acceptedPlan!.id, acceptedPlan!.promptedByInboxId, row.id);
      }
      let reply: string | InteractiveMessage;
      let handoff = false;
      let usedLlm = false;
      let usedFallback = false;
      let groundingResult = "not_used";
      let processedAction: string | undefined;
      let knowledge: KnowledgeData | undefined;
      const needsKnowledge = ["insurance", "procedure", "faq", "conversation"].includes(intent);
      if (needsKnowledge) knowledge = await this.loadKnowledge();
      const selectedPlanId = intent === "procedure"
        ? acceptedPlan?.id ?? (this.config.planTriageEnabled ? await this.patientActivePlanId(row.phone) : knowledge?.plans.find(isParticularPlan)?.id)
        : undefined;
      const verifiedFacts = knowledge
        ? resolveVerifiedFacts(messageText, knowledge, { insurancePlanId: selectedPlanId ?? undefined })
        : undefined;
      if (intent === "confirm") {
        const { data, error } = await this.db.rpc("confirm_upcoming_appointment_by_phone", { p_phone: row.phone });
        const result = data as { status?: "confirmed" | "already_confirmed" | "not_found" | "ambiguous"; start_at?: string } | null;
        if (error || !result?.status || !["confirmed", "already_confirmed", "not_found", "ambiguous"].includes(result.status)) throw new Error("APPOINTMENT_CONFIRMATION_FAILED");
        const accessUrl = ["not_found", "ambiguous"].includes(result.status) ? await inboxAccessUrl() : undefined;
        reply = attendanceConfirmationReplyMessage(result.status, result.start_at, accessUrl);
        processedAction = result.status === "confirmed" ? "appointment_confirmed" : result.status === "already_confirmed" ? "appointment_already_confirmed" : `confirmation_${result.status}`;
      }
      else if (intent === "appointment_status") {
        const { data, error } = await this.db.rpc("get_upcoming_appointment_by_phone", { p_phone: row.phone });
        const result = data as { status?: "found" | "not_found"; start_at?: string; professional_name?: string } | null;
        if (error || !result?.status || !["found", "not_found"].includes(result.status)) throw new Error("APPOINTMENT_LOOKUP_FAILED");
        const accessUrl = await inboxAccessUrl();
        reply = upcomingAppointmentInteractiveMessage(result.status, accessUrl, result.start_at, result.professional_name);
        processedAction = result.status === "found" ? "appointment_lookup" : "appointment_not_found";
      }
      else if (intent === "treatment_status") {
        reply = treatmentStatusHandoffMessage;
        handoff = true;
      }
      else if (verifiedFacts?.kind === "ambiguous_plan") {
        reply = ambiguousInsuranceMessage;
        processedAction = "structured_answer";
      }
      else if (verifiedFacts?.kind === "price_unavailable") {
        reply = priceConfirmationMessage;
        handoff = true;
      }
      else if (verifiedFacts?.kind === "resolved" && verifiedFacts.critical) {
        const facts = verifiedFacts.facts;
        if (facts.coverage && facts.plan && facts.procedure) {
          reply = knowledgeAnswerInteractiveMessage(verifiedCoverageMessage({
            planName: facts.plan.name,
            procedureName: facts.procedure.name,
            status: facts.coverage.status,
            instructions: facts.coverage.instructions,
          }));
          if (facts.coverage.status !== "accepted") handoff = true;
          else if (facts.procedure.online_booking) {
            // A confirmed coverage + online-bookable procedure is enough to
            // hand the secure portal link. The patient is not required to
            // also type "marcar" — that pattern made the bot describe the
            // procedure but never issue a link, which patients read as
            // "não está agendando pra mim".
            reply = accessLinkInteractiveMessage(await inboxAccessUrl(), "schedule");
            processedAction = "portal_link";
          }
        }
        else if (facts.planList) reply = knowledgeAnswerInteractiveMessage(verifiedPlanListMessage(facts.planList));
        else if (facts.procedureList) reply = knowledgeAnswerInteractiveMessage(verifiedProcedureListMessage(facts.procedureList));
        else if (facts.plan) reply = knowledgeAnswerInteractiveMessage(verifiedPlanMessage(facts.plan));
        else if (facts.childPolicy) reply = knowledgeAnswerInteractiveMessage(`${facts.childPolicy.name}: ${facts.childPolicy.description ?? "Consulte a equipe para detalhes."}`);
        else if (facts.procedure) {
          const particularPlanId = knowledge?.plans.find(isParticularPlan)?.id;
          if (facts.procedure.online_booking && isProcedureBookingRequest(messageText) && selectedPlanId === particularPlanId) {
            // Direct booking path for an explicit Particular session: the
            // patient opted into out-of-pocket payment and asked to book.
            reply = accessLinkInteractiveMessage(await inboxAccessUrl(), "schedule");
            processedAction = "portal_link";
          } else if (facts.procedure.online_booking && isProcedureBookingRequest(messageText) && !selectedPlanId) {
            reply = initialInsurancePromptMessage;
            processedAction = "plan_requested";
          } else if (facts.procedure.online_booking && selectedPlanId) {
            // A non-Particular plan is already resolved (from triage or a
            // saved patient profile) and the procedure is online-bookable,
            // so we can append a scheduling CTA to the description without
            // forcing the patient to retype "marcar".
            reply = knowledgeAnswerInteractiveMessage(verifiedProcedureMessage(facts.procedure), [{ type: "url", displayText: "Agendar avaliação", url: await inboxAccessUrl() }]);
            processedAction = "portal_link";
          } else reply = knowledgeAnswerInteractiveMessage(verifiedProcedureMessage(facts.procedure));
        }
        else {
          reply = knowledgeFallbackMessage;
          handoff = true;
        }
      }
      else if (["schedule", "reschedule", "cancel"].includes(intent)) reply = accessLinkInteractiveMessage(await inboxAccessUrl(), intent);
      else if (intent === "greeting") reply = greetingInteractiveMessage;
      else if (messageText === menuActions.questions) reply = questionsInteractiveMessage;
      else if (messageText === menuActions.insurance) reply = insurancePromptMessage;
      else if (messageText === menuActions.procedures) reply = procedurePromptMessage;
      else if (messageText === menuActions.unsupportedMedia) reply = unsupportedMediaInteractiveMessage;
      else if (isExplicitHumanRequest(messageText)) { reply = humanFallbackMessage; handoff = true; }
      else if (verifiedFacts?.kind === "resolved" && verifiedFacts.facts.faq) {
        const facts = { faq: verifiedFacts.facts.faq };
        if (this.config.openaiApiKey) {
          try {
            const conversationContext = await this.loadConversationContext(row.phone, row.id);
            const generated = await generateClinicReply({ apiKey: this.config.openaiApiKey, model: this.config.openaiModel, message: messageText, facts, conversationContext });
            usedLlm = true;
            groundingResult = "accepted";
            handoff = generated.handoffRequired;
            reply = handoff ? humanFallbackMessage : knowledgeAnswerInteractiveMessage(generated.text);
          } catch (error) {
            log("warn", "openai_reply_failed", { correlationId: row.id, error });
            usedFallback = true;
            groundingResult = "fallback";
            reply = knowledgeAnswerInteractiveMessage(facts.faq.answer);
          }
        } else {
          usedFallback = true;
          groundingResult = "disabled";
          reply = knowledgeAnswerInteractiveMessage(facts.faq.answer);
        }
      }
      else {
        reply = knowledgeFallbackMessage;
        handoff = true;
      }
      if (await this.ignoreIfConversationPaused(row, intent)) return;
      if (handoff) {
        const { data: handoffId, error } = await this.db.rpc("enqueue_human_handoff", { p_inbox_id: row.id, p_phone: row.phone, p_reason: handoffReason(messageText) });
        if (error || !handoffId) throw new Error("HANDOFF_ENQUEUE_FAILED");
      }
      if (await this.ignoreIfConversationPaused(row, intent)) return;
      if (!preparedInboxLink?.sentAt) {
        await this.sendReply(row.phone, reply);
        if (preparedInboxLink) await this.markInboxAccessLinkDelivered(row.phone, preparedInboxLink.sourceInboxId);
      }
      const action = processedAction ?? (handoff ? "handoff" : ["schedule", "reschedule", "cancel"].includes(intent) ? "portal_link" : usedLlm ? "llm_answer" : usedFallback ? "fallback_answer" : "structured_answer");
      await this.updateOrThrow("whatsapp_inbox", row.id, { status: "processed", processed_at: new Date().toISOString(), last_error: null, classified_intent: intent, processed_action: action }, row.lease_token);
      incrementCounter("luna_worker_messages_total", "Messages processed by the worker.", { queue: "inbox", result: handoff ? "handoff" : "answered" });
      log("info", "inbox_message_processed", { correlationId: row.id, intent, action, factResolution: verifiedFacts?.kind ?? "not_requested", factSource: verifiedFactSource(verifiedFacts), groundingResult, attempts: row.attempts, durationMs: Date.now() - startedAt });
    } catch (error) {
      incrementCounter("luna_worker_failures_total", "Worker processing failures.", { queue: "inbox" });
      log("error", "inbox_processing_failed", { correlationId: row.id, attempts: row.attempts, error });
      const deadLetter = row.attempts >= 6;
      if (deadLetter) incrementCounter("luna_worker_dead_letters_total", "Messages moved to dead-letter.", { queue: "inbox" });
      else incrementCounter("luna_worker_retries_total", "Messages scheduled for retry.", { queue: "inbox" });
      await this.updateOrThrow("whatsapp_inbox", row.id, { status: "failed", available_at: retryAt(row.attempts), last_error: deadLetter ? "max_attempts_exceeded" : "processing_failed", classified_intent: intent, dead_lettered_at: deadLetter ? new Date().toISOString() : null }, row.lease_token);
    }
  }
  private async createAccessUrl(phone: string) {
    const token = opaqueToken();
    const { error } = await this.db.from("access_tokens").insert({ phone, token_hash: tokenHash(token), origin: "whatsapp_link", expires_at: new Date(Date.now() + WHATSAPP_ACCESS_LINK_TTL_MS).toISOString() });
    if (error) throw error;
    return `${this.config.portalBaseUrl}/acesso#token=${encodeURIComponent(token)}`;
  }
  private async createInboxAccessUrl(phone: string, sourceInboxId: string): Promise<PreparedInboxAccessLink> {
    const token = opaqueToken();
    const request = {
      p_phone: phone,
      p_source_inbox_id: sourceInboxId,
      p_token_hash: tokenHash(token),
      p_encrypted_token: encryptOtp(token, this.config.otpSecret),
    };
    const { data, error } = await this.db.rpc("prepare_whatsapp_access_link", request);
    if (error) throw new Error("ACCESS_LINK_PREPARE_FAILED");
    const delivery = data as { encrypted_token?: unknown; phone?: unknown; token_hash?: unknown; token_status?: unknown; expires_at?: unknown; status?: unknown; sent_at?: unknown } | null;
    if (!delivery
      || typeof delivery.encrypted_token !== "string"
      || delivery.phone !== phone
      || typeof delivery.token_hash !== "string"
      || delivery.token_status !== "active"
      || !["prepared", "sent"].includes(String(delivery.status))
      || typeof delivery.expires_at !== "string") throw new Error("ACCESS_LINK_PREPARE_FAILED");
    const expiresAt = new Date(delivery.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) throw new Error("ACCESS_LINK_PREPARE_FAILED");
    const sentAt = typeof delivery.sent_at === "string" ? delivery.sent_at : null;
    if ((delivery.status === "sent") !== Boolean(sentAt)) throw new Error("ACCESS_LINK_PREPARE_FAILED");
    const reusableToken = decryptOtp(delivery.encrypted_token, this.config.otpSecret);
    if (tokenHash(reusableToken) !== delivery.token_hash) throw new Error("ACCESS_LINK_PREPARE_FAILED");
    return { url: `${this.config.portalBaseUrl}/acesso#token=${encodeURIComponent(reusableToken)}`, sourceInboxId, sentAt };
  }
  private async markInboxAccessLinkDelivered(phone: string, sourceInboxId: string) {
    const { data, error } = await this.db.rpc("mark_whatsapp_access_link_delivered", {
      p_phone: phone,
      p_source_inbox_id: sourceInboxId,
    });
    if (error || data !== true) throw new Error("ACCESS_LINK_DELIVERY_FINALIZE_FAILED");
  }
  private async loadKnowledge(): Promise<KnowledgeData> { const [plans, aliases, procedures, coverage, faqs] = await Promise.all([this.db.from("insurance_plans").select("id,name,instructions").eq("active", true), this.db.from("insurance_aliases").select("alias,insurance_plan_id").eq("active", true), this.db.from("procedures").select("id,name,description,online_booking").eq("active", true), this.db.from("procedure_coverage").select("procedure_id,insurance_plan_id,accepted,instructions"), this.db.from("faq_entries").select("category,question,answer").eq("active", true)]); if (plans.error || aliases.error || procedures.error || coverage.error || faqs.error) throw new Error("KNOWLEDGE_FAILED"); const knowledge = { plans: plans.data ?? [], aliases: aliases.data ?? [], procedures: procedures.data ?? [], coverage: coverage.data ?? [], faqs: faqs.data ?? [] }; return knowledge; }
  async run() { log("info", "worker_started", { workerId: this.config.workerId, pollMs: this.config.pollMs, healthPort: this.config.healthPort, concurrency: this.config.concurrency, leaseSeconds: this.config.leaseSeconds, recipientPolicy: this.config.recipientPolicy, allowedRecipientCount: this.config.allowedRecipients?.length ?? 0, interactiveMessages: this.config.interactiveMessages, dailySummaryHour: this.config.dailySummaryHour ?? 8, calendarSyncIntervalMs: this.config.calendarSyncIntervalMs, calendarSyncEnabled: Boolean(this.calendarAuth), openaiEnabled: Boolean(this.config.openaiApiKey) }); while (!this.stopped) { try { await this.tick(); } catch (error) { this.lastPoll = 0; incrementCounter("luna_worker_failures_total", "Worker processing failures.", { queue: "poll" }); log("error", "worker_poll_failed", { pollNumber: this.pollNumber, error }); } await new Promise((resolve) => setTimeout(resolve, this.config.pollMs)); } log("info", "worker_stopped", { pollsCompleted: this.pollNumber }); }
  stop() { if (!this.stopped) log("info", "worker_shutdown_requested", { pollsCompleted: this.pollNumber }); this.stopped = true; }
  healthy() { return !this.stopped && Date.now() - this.lastPoll < Math.max(this.config.pollMs * 5, 10_000); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.env.SERVICE_NAME = process.env.WORKER_SERVICE_NAME?.trim() || "luna-worker";
  const config = loadWorkerConfig(); const db = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } }); const evolution = new EvolutionClient({ baseUrl: config.evolutionBaseUrl, apiKey: config.evolutionApiKey, instance: config.evolutionInstance }); const worker = new MessagingWorker(db, evolution, config);
  const health = createServer((request, response) => { if (request.url === "/health") { response.writeHead(worker.healthy() ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify({ status: worker.healthy() ? "ok" : "unhealthy" })); return; } if (request.url === "/metrics") { const expected = process.env.METRICS_TOKEN ?? ""; const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? ""; const left = Buffer.from(supplied); const right = Buffer.from(expected); if (!expected || left.length !== right.length || !timingSafeEqual(left, right)) { response.writeHead(401).end("unauthorized\n"); return; } response.writeHead(200, { "Content-Type": "text/plain; version=0.0.4", "Cache-Control": "no-store" }).end(renderPrometheusMetrics()); return; } response.writeHead(404).end(); }).listen(config.healthPort);
  const shutdown = () => { worker.stop(); health.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref(); }; process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown); void worker.run();
}
