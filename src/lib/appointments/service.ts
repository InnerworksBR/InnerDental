import "server-only";

import { AppointmentPolicyError, calendarEventPayload, ensureFutureCancellation } from "@/domain/appointments/service";
import { intervalForSlots, slotCountForInterval, type AppointmentSlotCount } from "@/domain/availability/slots";
import { GoogleCalendarHttpGateway } from "@/integrations/google-calendar/http-gateway";
import { consumeSlotHold, getProfessionalCalendar } from "@/lib/availability/repository";
import { verifySlotSequenceFresh } from "@/lib/availability/service";
import { beginOperation, cancelAppointment, completeOperation, createAppointment, findOperation, listPatientAppointments, markOperationForReconciliation, patientForPhone, requirePatientAppointment, rescheduleAppointment } from "@/lib/appointments/repository";

type MutationInput = { phone: string; appointmentId: string; idempotencyKey: string; token: string };
async function replayIdempotent(key: string) {
  const previous = await findOperation(key);
  if (previous?.status === "completed") return previous.response;
  if (previous) throw new Error(previous.status === "reconciliation_required" ? "RECONCILIATION_REQUIRED" : "OPERATION_IN_PROGRESS");
  return undefined;
}
async function beginIdempotent(patientId: string, key: string, operation: "create" | "reschedule" | "cancel", appointmentId?: string) {
  try { await beginOperation(patientId, key, operation, appointmentId); } catch {
    const replay = await findOperation(key);
    if (replay?.status === "completed") return replay.response;
    throw new Error(replay?.status === "reconciliation_required" ? "RECONCILIATION_REQUIRED" : "OPERATION_IN_PROGRESS");
  }
  return undefined;
}
export async function createPatientAppointment(input: { phone: string; sessionId: string; holdId: string; patientName?: string; companionName?: string; partySize: AppointmentSlotCount; insurancePlanId?: string; professionalId: string; date: string; time: string; idempotencyKey: string; token: string }) {
  const patient = await patientForPhone(input.phone, input.patientName, input.insurancePlanId); const replay = await replayIdempotent(input.idempotencyKey); if (replay) return replay;
  if (!await verifySlotSequenceFresh(input.professionalId, input.date, input.time, input.partySize, input.token)) throw new Error("SLOT_UNAVAILABLE");
  const calendarId = await getProfessionalCalendar(input.professionalId); if (!calendarId) throw new Error("SLOT_UNAVAILABLE");
  const interval = intervalForSlots(input.date, input.time, input.partySize); let eventCreated = false; let calendarEventId: string | undefined;
  if (!await consumeSlotHold({ holdId: input.holdId, professionalId: input.professionalId, startAt: interval.startAt, endAt: interval.endAt, phone: input.phone, sessionId: input.sessionId })) throw new Error("SLOT_UNAVAILABLE");
  const begun = await beginIdempotent(patient.id, input.idempotencyKey, "create"); if (begun) return begun;
  try {
    const eventId = await new GoogleCalendarHttpGateway(input.token).createEvent(calendarId, calendarEventPayload({ appointmentId: input.idempotencyKey, patientName: patient.name ?? "Paciente", companionName: input.partySize === 2 ? input.companionName : undefined, phone: input.phone, interval })); calendarEventId = eventId; eventCreated = true;
    const appointment = await createAppointment({ patientId: patient.id, professionalId: input.professionalId, insurancePlanId: input.insurancePlanId, startAt: interval.startAt, endAt: interval.endAt, calendarEventId: eventId, idempotencyKey: input.idempotencyKey });
    await completeOperation(input.idempotencyKey, appointment); return appointment;
  } catch (error) { if (eventCreated) await markOperationForReconciliation(input.idempotencyKey, { type: "create", professionalId: input.professionalId, calendarEventId, interval }); throw error; }
}
export async function reschedulePatientAppointment(input: MutationInput & { date: string; time: string; holdId: string; sessionId: string }) {
  const appointment = await requirePatientAppointment(input.phone, input.appointmentId); if (appointment.status === "cancelled" || !appointment.calendar_event_id) throw new Error("APPOINTMENT_NOT_AVAILABLE");
  const replay = await replayIdempotent(input.idempotencyKey); if (replay) return replay;
  const slotCount = slotCountForInterval({ startAt: appointment.start_at, endAt: appointment.end_at });
  if (!await verifySlotSequenceFresh(appointment.professional_id, input.date, input.time, slotCount, input.token)) throw new Error("SLOT_UNAVAILABLE");
  const calendarId = await getProfessionalCalendar(appointment.professional_id); if (!calendarId) throw new Error("SLOT_UNAVAILABLE"); const interval = intervalForSlots(input.date, input.time, slotCount);
  if (!await consumeSlotHold({ holdId: input.holdId, professionalId: appointment.professional_id, startAt: interval.startAt, endAt: interval.endAt, phone: input.phone, sessionId: input.sessionId })) throw new Error("SLOT_UNAVAILABLE");
  const begun = await beginIdempotent(appointment.patient_id, input.idempotencyKey, "reschedule", appointment.id); if (begun) return begun;
  try { await new GoogleCalendarHttpGateway(input.token).rescheduleEvent(calendarId, appointment.calendar_event_id, interval); const result = await rescheduleAppointment(appointment.id, interval); await completeOperation(input.idempotencyKey, result); return result; }
  catch (error) { await markOperationForReconciliation(input.idempotencyKey, { type: "reschedule", appointmentId: appointment.id, interval }); throw error; }
}
export async function cancelPatientAppointment(input: MutationInput) {
  const appointment = await requirePatientAppointment(input.phone, input.appointmentId); if (appointment.status === "cancelled") return appointment;
  if (!appointment.calendar_event_id) throw new Error("APPOINTMENT_NOT_AVAILABLE"); ensureFutureCancellation(appointment.start_at);
  const replay = await beginIdempotent(appointment.patient_id, input.idempotencyKey, "cancel", appointment.id); if (replay) return replay;
  const calendarId = await getProfessionalCalendar(appointment.professional_id); if (!calendarId) throw new Error("SLOT_UNAVAILABLE");
  try { await new GoogleCalendarHttpGateway(input.token).deleteEvent(calendarId, appointment.calendar_event_id); const result = await cancelAppointment(appointment.id); await completeOperation(input.idempotencyKey, result); return result; }
  catch (error) { await markOperationForReconciliation(input.idempotencyKey, { type: "cancel", appointmentId: appointment.id }); throw error; }
}
export async function listReconciledPatientAppointments(phone: string, token: string) {
  const appointments = await listPatientAppointments(phone);
  return Promise.all(appointments.map(async (appointment) => {
    const professional = Array.isArray(appointment.professionals) ? appointment.professionals[0] : appointment.professionals;
    const professionalCalendarId = professional?.calendar_id?.trim();
    const calendarId = professionalCalendarId && professionalCalendarId !== "CONFIGURE_GOOGLE_CALENDAR_ID"
      ? professionalCalendarId
      : process.env.GOOGLE_CALENDAR_ID?.trim();
    if (!appointment.calendar_event_id || !calendarId || appointment.status === "cancelled") return appointment;
    const event = await new GoogleCalendarHttpGateway(token).getEventInterval(calendarId, appointment.calendar_event_id);
    return { ...appointment, calendarState: event && event.startAt === appointment.start_at && event.endAt === appointment.end_at ? "confirmed" : "reconciliation_required" };
  }));
}
export { AppointmentPolicyError };
