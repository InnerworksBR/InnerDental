import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type AppointmentRow = {
  id: string; patient_id: string; professional_id: string; start_at: string; end_at: string;
  status: "scheduled" | "rescheduled" | "cancelled" | "completed" | "no_show";
  calendar_event_id: string | null;
};

export async function patientForPhone(phone: string, name?: string, insurancePlanId?: string) {
  const query = createSupabaseAdminClient().from("patients");
  const profile = { phone, ...(name ? { name: name.trim() } : {}), ...(insurancePlanId ? { insurance_plan_id: insurancePlanId } : {}) };
  const { data, error } = await query.upsert(profile, { onConflict: "phone" }).select("id,name,insurance_plan_id").single();
  if (error) throw new Error("PATIENT_FAILED");
  return data as { id: string; name: string | null; insurance_plan_id: string | null };
}
export async function patientProfileForPhone(phone: string) {
  const { data, error } = await createSupabaseAdminClient().from("patients").select("name,insurance_plan_id,insurance_plans(active)").eq("phone", phone).maybeSingle();
  if (error) throw new Error("PATIENT_READ_FAILED");
  const relation = Array.isArray(data?.insurance_plans) ? data.insurance_plans[0] : data?.insurance_plans;
  const insurancePlanId = relation?.active ? data?.insurance_plan_id ?? null : null;
  return { name: data?.name ?? null, insurancePlanId, complete: Boolean(data?.name && insurancePlanId) };
}
export async function patientById(id: string) {
  const { data, error } = await createSupabaseAdminClient().from("patients").select("id,name,phone").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("PATIENT_NOT_FOUND");
  return data as { id: string; name: string | null; phone: string };
}
export async function findOperation(key: string) {
  const { data } = await createSupabaseAdminClient().from("appointment_operations").select("response,status").eq("idempotency_key", key).maybeSingle();
  return data as { response: unknown; status: "pending" | "completed" | "reconciliation_required" } | null;
}
export async function beginOperation(patientId: string, key: string, operation: "create" | "reschedule" | "cancel", appointmentId?: string) {
  const { error } = await createSupabaseAdminClient().from("appointment_operations").insert({ patient_id: patientId, appointment_id: appointmentId, idempotency_key: key, operation });
  if (error) throw new Error("OPERATION_EXISTS");
}
export async function completeOperation(key: string, response: unknown) {
  const { error } = await createSupabaseAdminClient().from("appointment_operations").update({ status: "completed", response }).eq("idempotency_key", key);
  if (error) throw new Error("OPERATION_FAILED");
}
export async function requirePatientAppointment(phone: string, appointmentId: string): Promise<AppointmentRow> {
  const client = createSupabaseAdminClient();
  const { data: patient, error: patientError } = await client.from("patients").select("id").eq("phone", phone).maybeSingle();
  if (patientError || !patient) throw new Error("APPOINTMENT_NOT_FOUND");
  const { data, error } = await client.from("appointments").select("id,patient_id,professional_id,start_at,end_at,status,calendar_event_id").eq("id", appointmentId).eq("patient_id", patient.id).maybeSingle();
  if (error || !data) throw new Error("APPOINTMENT_NOT_FOUND");
  return data as AppointmentRow;
}
export async function requireAdminAppointment(appointmentId: string): Promise<AppointmentRow> {
  const { data, error } = await createSupabaseAdminClient().from("appointments").select("id,patient_id,professional_id,start_at,end_at,status,calendar_event_id").eq("id", appointmentId).maybeSingle();
  if (error || !data) throw new Error("APPOINTMENT_NOT_FOUND");
  return data as AppointmentRow;
}
export async function createAppointment(input: { patientId: string; professionalId: string; insurancePlanId?: string; startAt: string; endAt: string; calendarEventId: string; idempotencyKey: string; source?: "portal" | "manual" }) {
  const { data, error } = await createSupabaseAdminClient().from("appointments").insert({ patient_id: input.patientId, professional_id: input.professionalId, insurance_plan_id: input.insurancePlanId, start_at: input.startAt, end_at: input.endAt, calendar_event_id: input.calendarEventId, source: input.source ?? "portal", idempotency_key: input.idempotencyKey }).select("id,start_at,end_at,status,calendar_event_id").single();
  if (error?.code === "23505") throw new Error("SLOT_UNAVAILABLE");
  if (error) throw new Error("APPOINTMENT_FAILED");
  return data;
}
export async function rescheduleAppointment(id: string, interval: { startAt: string; endAt: string }) {
  const { data, error } = await createSupabaseAdminClient().from("appointments").update({ start_at: interval.startAt, end_at: interval.endAt, status: "rescheduled" }).eq("id", id).in("status", ["scheduled", "rescheduled"]).select("id,start_at,end_at,status,calendar_event_id").single();
  if (error || !data) throw new Error("APPOINTMENT_UPDATE_FAILED");
  return data;
}
export async function cancelAppointment(id: string) {
  const { data, error } = await createSupabaseAdminClient().from("appointments").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", id).in("status", ["scheduled", "rescheduled"]).select("id,start_at,end_at,status,calendar_event_id").single();
  if (error || !data) throw new Error("APPOINTMENT_UPDATE_FAILED");
  return data;
}
export async function markOperationForReconciliation(key: string, response: unknown) {
  await createSupabaseAdminClient().from("appointment_operations").update({ status: "reconciliation_required", response }).eq("idempotency_key", key);
}
export async function listPatientAppointments(phone: string) {
  const client = createSupabaseAdminClient();
  const { data: patient } = await client.from("patients").select("id").eq("phone", phone).maybeSingle();
  if (!patient) return [];
  const { data, error } = await client.from("appointments").select("id,start_at,end_at,status,calendar_event_id,professionals(name,calendar_id)").eq("patient_id", patient.id).order("start_at");
  if (error) throw new Error("APPOINTMENT_READ_FAILED");
  return data ?? [];
}
