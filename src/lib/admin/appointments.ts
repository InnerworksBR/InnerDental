import "server-only";

import { calendarEventPayload } from "@/domain/appointments/service";
import { intervalForSlots, slotCountForInterval, slotFor } from "@/domain/availability/slots";
import { GoogleCalendarHttpGateway } from "@/integrations/google-calendar/http-gateway";
import { getGoogleCalendarAccessToken } from "@/integrations/google-calendar/auth";
import { getProfessionalCalendar } from "@/lib/availability/repository";
import { verifySlotFresh, verifySlotSequenceFresh } from "@/lib/availability/service";
import { beginOperation, cancelAppointment, completeOperation, createAppointment, findOperation, markOperationForReconciliation, patientById, requireAdminAppointment, rescheduleAppointment } from "@/lib/appointments/repository";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

async function beginAdminOperation(patientId: string, key: string, operation: "create" | "reschedule" | "cancel", appointmentId?: string) {
  const previous = await findOperation(key);
  if (previous?.status === "completed") return previous.response;
  if (previous) throw new Error(previous.status === "reconciliation_required" ? "RECONCILIATION_REQUIRED" : "OPERATION_IN_PROGRESS");
  try { await beginOperation(patientId, key, operation, appointmentId); } catch {
    const replay = await findOperation(key);
    if (replay?.status === "completed") return replay.response;
    throw new Error(replay?.status === "reconciliation_required" ? "RECONCILIATION_REQUIRED" : "OPERATION_IN_PROGRESS");
  }
  return undefined;
}
async function auditAdminAction(actorId: string, action: string, appointmentId: string, metadata: Record<string, unknown>) {
  await createSupabaseAdminClient().from("audit_logs").insert({ action, entity: "appointments", entity_id: appointmentId, source: "internal_panel", actor_id: actorId, metadata });
}

export async function createAdminAppointment(input: { patientId: string; professionalId: string; date: string; time: string; idempotencyKey: string; actorId: string }) {
  const patient = await patientById(input.patientId); const replay = await beginAdminOperation(patient.id, input.idempotencyKey, "create"); if (replay) return replay;
  const token = await getGoogleCalendarAccessToken();
  if (!await verifySlotFresh(input.professionalId, input.date, input.time, token)) throw new Error("SLOT_UNAVAILABLE");
  const calendarId = await getProfessionalCalendar(input.professionalId); if (!calendarId) throw new Error("SLOT_UNAVAILABLE"); const interval = slotFor(input.date, input.time); let eventId: string | undefined;
  try { eventId = await new GoogleCalendarHttpGateway(token).createEvent(calendarId, calendarEventPayload({ appointmentId: input.idempotencyKey, patientName: patient.name ?? "Paciente", phone: patient.phone, interval })); const appointment = await createAppointment({ patientId: patient.id, professionalId: input.professionalId, startAt: interval.startAt, endAt: interval.endAt, calendarEventId: eventId, idempotencyKey: input.idempotencyKey, source: "manual" }); await completeOperation(input.idempotencyKey, appointment); await auditAdminAction(input.actorId, "admin_create", appointment.id, { idempotency_key: input.idempotencyKey }); return appointment; }
  catch (error) { if (eventId) await markOperationForReconciliation(input.idempotencyKey, { type: "admin_create", professionalId: input.professionalId, calendarEventId: eventId, interval }); throw error; }
}

export async function rescheduleAdminAppointment(input: { appointmentId: string; date: string; time: string; idempotencyKey: string; actorId: string }) {
  const appointment = await requireAdminAppointment(input.appointmentId); if (appointment.status === "cancelled" || !appointment.calendar_event_id) throw new Error("APPOINTMENT_NOT_AVAILABLE"); const replay = await beginAdminOperation(appointment.patient_id, input.idempotencyKey, "reschedule", appointment.id); if (replay) return replay;
  const slotCount = slotCountForInterval({ startAt: appointment.start_at, endAt: appointment.end_at });
  const token = await getGoogleCalendarAccessToken(); if (!await verifySlotSequenceFresh(appointment.professional_id, input.date, input.time, slotCount, token)) throw new Error("SLOT_UNAVAILABLE"); const calendarId = await getProfessionalCalendar(appointment.professional_id); if (!calendarId) throw new Error("SLOT_UNAVAILABLE"); const interval = intervalForSlots(input.date, input.time, slotCount);
  try { await new GoogleCalendarHttpGateway(token).rescheduleEvent(calendarId, appointment.calendar_event_id, interval); const result = await rescheduleAppointment(appointment.id, interval); await completeOperation(input.idempotencyKey, result); await auditAdminAction(input.actorId, "admin_reschedule", appointment.id, { idempotency_key: input.idempotencyKey }); return result; }
  catch (error) { await markOperationForReconciliation(input.idempotencyKey, { type: "admin_reschedule", appointmentId: appointment.id, interval }); throw error; }
}

export async function cancelAdminAppointment(input: { appointmentId: string; idempotencyKey: string; actorId: string }) {
  const appointment = await requireAdminAppointment(input.appointmentId); if (appointment.status === "cancelled") return appointment; if (!appointment.calendar_event_id) throw new Error("APPOINTMENT_NOT_AVAILABLE"); const replay = await beginAdminOperation(appointment.patient_id, input.idempotencyKey, "cancel", appointment.id); if (replay) return replay;
  const token = await getGoogleCalendarAccessToken(); const calendarId = await getProfessionalCalendar(appointment.professional_id); if (!calendarId) throw new Error("SLOT_UNAVAILABLE");
  try { await new GoogleCalendarHttpGateway(token).deleteEvent(calendarId, appointment.calendar_event_id); const result = await cancelAppointment(appointment.id); await completeOperation(input.idempotencyKey, result); await auditAdminAction(input.actorId, "admin_cancel", appointment.id, { idempotency_key: input.idempotencyKey }); return result; }
  catch (error) { await markOperationForReconciliation(input.idempotencyKey, { type: "admin_cancel", appointmentId: appointment.id }); throw error; }
}
