import "server-only";

import type { TimeInterval } from "@/domain/availability/slots";
import { getGoogleCalendarAccessToken } from "@/integrations/google-calendar/auth";
import { GoogleCalendarHttpGateway } from "@/integrations/google-calendar/http-gateway";
import type { CalendarEvent } from "@/integrations/google-calendar/port";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AppointmentRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  source: string;
  calendar_origin?: "system" | "direct";
  calendar_event_id: string | null;
  patients: { name: string | null; phone: string } | { name: string | null; phone: string }[] | null;
  professionals: { name: string } | { name: string }[] | null;
};

type BlockRow = { id: string; date: string; status: string; calendar_event_id: string | null; professionals: { name: string } | { name: string }[] | null };
type ProfessionalCalendarRow = { id: string; name: string; calendar_id: string };
type InboxRow = { id: string; phone: string; status: string; classified_intent: string | null; processed_action: string | null; last_error: string | null; dead_lettered_at: string | null; attempts: number; created_at: string; processed_at: string | null };
type OutboxRow = { id: string; aggregate_type: string; aggregate_id: string; event_type: string; status: string; attempts: number; last_error: string | null; dead_lettered_at: string | null; created_at: string; sent_at: string | null };

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function maskPhone(phone: string): string {
  return phone.length <= 4 ? "••••" : `${"•".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}

export function projectAppointment(row: AppointmentRow) {
  const patient = one(row.patients);
  const professional = one(row.professionals);
  return {
    id: row.id,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    source: row.calendar_origin === "direct" ? "google_calendar" : row.source,
    calendarEventId: row.calendar_event_id,
    patientName: patient?.name ?? "Paciente",
    agendaLabel: patient ? `${patient.name ?? "Paciente"} ${patient.phone}` : "Paciente",
    maskedPhone: patient ? maskPhone(patient.phone) : "••••",
    professionalName: professional?.name ?? "Profissional",
  };
}

export function sanitizeCalendarEventTitle(summary: string | null): string {
  const title = summary?.trim() || "Evento no Google Calendar";
  return title
    .replace(/\+?\d[\d\s().-]{6,}\d/g, (match) => {
      const digits = match.replace(/\D/g, "");
      return digits.length >= 8 ? maskPhone(digits) : match;
    })
    .slice(0, 120);
}

export function projectCalendarEvent(event: CalendarEvent, professional: { id: string; name: string }) {
  return {
    id: `google-calendar:${professional.id}:${event.id}`,
    calendarEventId: event.id,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    title: sanitizeCalendarEventTitle(event.summary),
    professionalName: professional.name,
    source: "google_calendar" as const,
  };
}

export function projectDirectCalendarEvents(
  events: CalendarEvent[],
  professional: { id: string; name: string },
  linkedEventIds: Set<string>,
) {
  return events
    .filter((event) => !linkedEventIds.has(event.id))
    .map((event) => projectCalendarEvent(event, professional));
}

function nextDate(date: string): string {
  const value = new Date(`${date}T12:00:00-03:00`);
  value.setUTCDate(value.getUTCDate() + 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(value);
}

function configuredCalendarId(value: string): string | null {
  const calendarId = value.trim();
  if (calendarId && calendarId !== "CONFIGURE_GOOGLE_CALENDAR_ID") return calendarId;
  return process.env.GOOGLE_CALENDAR_ID?.trim() || null;
}

async function listDirectCalendarEvents(
  professionals: ProfessionalCalendarRow[],
  range: TimeInterval,
  linkedEventIds: Set<string>,
) {
  const configured = professionals.flatMap((professional) => {
    const calendarId = configuredCalendarId(professional.calendar_id);
    return calendarId ? [{ professional, calendarId }] : [];
  });
  if (configured.length === 0) return { calendarEvents: [], calendarStatus: "not_configured" as const };

  try {
    const token = await getGoogleCalendarAccessToken();
    const gateway = new GoogleCalendarHttpGateway(token);
    const results = await Promise.allSettled(configured.map(async ({ professional, calendarId }) => ({
      professional,
      events: await gateway.listEvents(calendarId, range),
    })));
    const calendarEvents = results.flatMap((result) => result.status === "fulfilled"
      ? projectDirectCalendarEvents(result.value.events, result.value.professional, linkedEventIds)
      : []);
    const failed = results.filter((result) => result.status === "rejected").length;
    return {
      calendarEvents: calendarEvents.sort((left, right) => left.startAt.localeCompare(right.startAt)),
      calendarStatus: failed === 0 ? "ok" as const : failed === results.length ? "unavailable" as const : "partial" as const,
    };
  } catch {
    return { calendarEvents: [], calendarStatus: "unavailable" as const };
  }
}

export async function listAdminAgendaRange(startDate: string, endDate: string) {
  if (startDate > endDate) throw new Error("ADMIN_AGENDA_RANGE_INVALID");
  const client = createSupabaseAdminClient();
  const start = `${startDate}T00:00:00-03:00`;
  const end = `${nextDate(endDate)}T00:00:00-03:00`;
  const [appointments, blocks, professionals] = await Promise.all([
    client.from("appointments").select("id,start_at,end_at,status,source,calendar_origin,calendar_event_id,patients(name,phone),professionals(name)").gte("start_at", start).lt("start_at", end).order("start_at"),
    client.from("calendar_blocks").select("id,date,status,calendar_event_id,professionals(name)").gte("date", startDate).lte("date", endDate).order("date").order("created_at"),
    client.from("professionals").select("id,name,calendar_id").eq("active", true).order("name"),
  ]);
  if (appointments.error || blocks.error || professionals.error) throw new Error("ADMIN_AGENDA_READ_FAILED");
  const appointmentRows = (appointments.data as AppointmentRow[] ?? []);
  const blockRows = (blocks.data as BlockRow[] ?? []);
  const linkedEventIds = new Set([
    ...appointmentRows.map((appointment) => appointment.calendar_event_id),
    ...blockRows.map((block) => block.calendar_event_id),
  ].filter((eventId): eventId is string => Boolean(eventId)));
  const calendar = await listDirectCalendarEvents(
    (professionals.data as ProfessionalCalendarRow[] ?? []),
    { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() },
    linkedEventIds,
  );
  return {
    appointments: appointmentRows.map(projectAppointment),
    blocks: blockRows.map((block) => ({ id: block.id, date: block.date, status: block.status, professionalName: one(block.professionals)?.name ?? "Profissional" })),
    ...calendar,
  };
}

export async function listAdminAgenda(date: string) {
  return listAdminAgendaRange(date, date);
}

export async function listAdminActivity(limit = 50) {
  const client = createSupabaseAdminClient();
  const [inbox, outbox] = await Promise.all([
    client.from("whatsapp_inbox").select("id,phone,status,classified_intent,processed_action,last_error,dead_lettered_at,attempts,created_at,processed_at").order("created_at", { ascending: false }).limit(limit),
    client.from("notification_outbox").select("id,aggregate_type,aggregate_id,event_type,status,attempts,last_error,dead_lettered_at,created_at,sent_at").order("created_at", { ascending: false }).limit(limit),
  ]);
  if (inbox.error || outbox.error) throw new Error("ADMIN_ACTIVITY_READ_FAILED");
  return {
    inbox: (inbox.data as InboxRow[] ?? []).map((entry) => ({ ...entry, phone: maskPhone(entry.phone), status: entry.dead_lettered_at ? "dead-letter" : entry.status, processed_action: entry.dead_lettered_at ? null : entry.processed_action })),
    outbox: (outbox.data as OutboxRow[] ?? []).map((entry) => ({ ...entry, status: entry.dead_lettered_at ? "dead-letter" : entry.status })),
  };
}

export async function listAdminProfessionals() {
  const { data, error } = await createSupabaseAdminClient().from("professionals").select("id,name").order("name");
  if (error) throw new Error("ADMIN_PROFESSIONALS_READ_FAILED");
  return (data ?? []).map((professional) => ({ id: professional.id, name: professional.name }));
}
