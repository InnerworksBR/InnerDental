import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDirectCalendarAppointment } from "../src/domain/appointments/calendar-import.ts";
import { GoogleCalendarHttpGateway } from "../src/integrations/google-calendar/http-gateway.ts";
import type { CalendarGateway } from "../src/integrations/google-calendar/port.ts";

type ProfessionalRow = { id: string; calendar_id: string };
type SyncStatus = "imported" | "updated" | "unchanged" | "linked" | "conflict";

export type DirectCalendarSyncSummary = {
  calendars: number; imported: number; updated: number; unchanged: number;
  linked: number; conflicts: number; ignored: number; reconciled: number;
};

function configuredCalendarId(value: string, fallback?: string): string | null {
  const trimmed = value?.trim();
  if (trimmed && trimmed !== "CONFIGURE_GOOGLE_CALENDAR_ID") return trimmed;
  return fallback?.trim() || null;
}

export async function syncDirectCalendarAppointments(input: {
  db: SupabaseClient;
  getAccessToken: () => Promise<string>;
  fallbackCalendarId?: string;
  now?: Date;
  horizonDays?: number;
  gatewayFactory?: (accessToken: string) => CalendarGateway;
}): Promise<DirectCalendarSyncSummary> {
  const now = input.now ?? new Date();
  const horizonDays = input.horizonDays ?? 8;
  const range = { startAt: now.toISOString(), endAt: new Date(now.getTime() + horizonDays * 86_400_000).toISOString() };
  const professionalsResult = await input.db.from("professionals").select("id,calendar_id").eq("active", true);
  if (professionalsResult.error) throw new Error("DIRECT_CALENDAR_PROFESSIONALS_LOOKUP_FAILED");
  const configured = ((professionalsResult.data ?? []) as ProfessionalRow[])
    .map((professional) => ({ professionalId: professional.id, calendarId: configuredCalendarId(professional.calendar_id, input.fallbackCalendarId) }))
    .filter((entry): entry is { professionalId: string; calendarId: string } => Boolean(entry.calendarId));
  if (new Set(configured.map((entry) => entry.calendarId)).size !== configured.length) throw new Error("DIRECT_CALENDAR_DUPLICATE_ASSIGNMENT");

  const summary: DirectCalendarSyncSummary = { calendars: configured.length, imported: 0, updated: 0, unchanged: 0, linked: 0, conflicts: 0, ignored: 0, reconciled: 0 };
  if (configured.length === 0) return summary;
  const gateway = (input.gatewayFactory ?? ((token) => new GoogleCalendarHttpGateway(token)))(await input.getAccessToken());

  for (const professional of configured) {
    const events = await gateway.listEvents(professional.calendarId, range);
    const seenDirectEventIds: string[] = [];
    for (const event of events) {
      const appointment = parseDirectCalendarAppointment(event, now);
      if (!appointment) { summary.ignored += 1; continue; }
      const result = await input.db.rpc("sync_direct_calendar_appointment", {
        p_professional_id: professional.professionalId,
        p_calendar_event_id: appointment.calendarEventId,
        p_patient_name: appointment.patientName,
        p_phone: appointment.phone,
        p_start_at: appointment.startAt,
        p_end_at: appointment.endAt,
        p_seen_at: now.toISOString(),
      });
      const status = (result.data as { status?: SyncStatus } | null)?.status;
      if (result.error || !status || !["imported", "updated", "unchanged", "linked", "conflict"].includes(status)) throw new Error("DIRECT_CALENDAR_APPOINTMENT_SYNC_FAILED");
      if (["imported", "updated", "unchanged"].includes(status)) seenDirectEventIds.push(appointment.calendarEventId);
      if (status === "conflict") summary.conflicts += 1;
      else summary[status] += 1;
    }
    const reconciliation = await input.db.rpc("reconcile_direct_calendar_appointments", {
      p_professional_id: professional.professionalId,
      p_range_start: range.startAt,
      p_range_end: range.endAt,
      p_seen_event_ids: seenDirectEventIds,
    });
    if (reconciliation.error || !Number.isInteger(reconciliation.data) || Number(reconciliation.data) < 0) throw new Error("DIRECT_CALENDAR_RECONCILIATION_FAILED");
    summary.reconciled += Number(reconciliation.data);
  }
  return summary;
}
