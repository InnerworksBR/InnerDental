import "server-only";

import { allDayBlockEventPayload } from "@/domain/appointments/service";
import { GoogleCalendarHttpGateway } from "@/integrations/google-calendar/http-gateway";
import { getGoogleCalendarAccessToken } from "@/integrations/google-calendar/auth";
import { getProfessionalCalendar } from "@/lib/availability/repository";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export class CalendarBlockConflictError extends Error {}
export class CalendarBlockReconciliationError extends Error {}

type CalendarBlock = { id: string; status: "active" | "reconciliation_required" | "cancelled"; calendar_event_id: string | null };

export async function createAllDayCalendarBlock(input: { professionalId: string; date: string; idempotencyKey: string; actorId: string }) {
  const client = createSupabaseAdminClient();
  const existing = await client.from("calendar_blocks").select("id,status,calendar_event_id").eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (existing.error) throw new Error("CALENDAR_BLOCK_READ_FAILED");
  if (existing.data?.status === "active") return existing.data as CalendarBlock;
  if (existing.data) throw new CalendarBlockReconciliationError("CALENDAR_BLOCK_RECONCILIATION_REQUIRED");

  const professional = await client.from("professionals").select("id,name").eq("id", input.professionalId).maybeSingle();
  if (professional.error || !professional.data) throw new CalendarBlockConflictError("PROFESSIONAL_NOT_FOUND");
  const created = await client.from("calendar_blocks").insert({ professional_id: input.professionalId, date: input.date, idempotency_key: input.idempotencyKey, created_by: input.actorId, status: "reconciliation_required" }).select("id,status,calendar_event_id").single();
  if (created.error || !created.data) {
    if (created.error?.code === "23505") throw new CalendarBlockConflictError("DATE_ALREADY_BLOCKED");
    throw new Error("CALENDAR_BLOCK_CREATE_FAILED");
  }

  const calendarId = await getProfessionalCalendar(input.professionalId);
  if (!calendarId) throw new CalendarBlockReconciliationError("CALENDAR_NOT_CONFIGURED");
  try {
    const token = await getGoogleCalendarAccessToken();
    const eventId = await new GoogleCalendarHttpGateway(token).createEvent(calendarId, allDayBlockEventPayload({ blockId: created.data.id, date: input.date, professionalName: professional.data.name }));
    const savedEvent = await client.from("calendar_blocks").update({ calendar_event_id: eventId }).eq("id", created.data.id).select("id,status,calendar_event_id").single();
    if (savedEvent.error || !savedEvent.data) throw new CalendarBlockReconciliationError("CALENDAR_BLOCK_EVENT_PERSIST_FAILED");
    const activated = await client.from("calendar_blocks").update({ status: "active" }).eq("id", created.data.id).select("id,status,calendar_event_id").single();
    if (activated.error || !activated.data) throw new CalendarBlockReconciliationError("CALENDAR_BLOCK_ACTIVATION_FAILED");
    return activated.data as CalendarBlock;
  } catch (error) {
    if (error instanceof CalendarBlockReconciliationError) throw error;
    throw new CalendarBlockReconciliationError("CALENDAR_BLOCK_RECONCILIATION_REQUIRED");
  }
}
