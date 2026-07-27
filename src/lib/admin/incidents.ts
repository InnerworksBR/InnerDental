import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const incidentCategories = ["validation", "google_calendar", "supabase", "evolution", "worker", "unknown"] as const;
export type IncidentCategory = typeof incidentCategories[number];

export class IncidentNotFoundError extends Error {}
export class IncidentStateError extends Error {}

export async function listOperationalIncidents(limit = 50) {
  const { data, error } = await createSupabaseAdminClient().from("operational_incidents").select("id,category,status,correlation_id,appointment_id,summary,opened_at,resolved_at").order("opened_at", { ascending: false }).limit(limit);
  if (error) throw new Error("INCIDENT_LIST_FAILED");
  return data ?? [];
}

export async function openOperationalIncident(input: { category: IncidentCategory; summary: string; correlationId?: string; appointmentId?: string; actorId: string }) {
  const { data, error } = await createSupabaseAdminClient().from("operational_incidents").insert({ category: input.category, summary: input.summary, correlation_id: input.correlationId ?? null, appointment_id: input.appointmentId ?? null, opened_by: input.actorId }).select("id,category,status,summary,opened_at").single();
  if (error || !data) throw new Error("INCIDENT_CREATE_FAILED");
  return data;
}

export async function addOperationalIncidentNote(input: { incidentId: string; body: string; actorId: string }) {
  const { data, error } = await createSupabaseAdminClient().from("operational_incident_notes").insert({ incident_id: input.incidentId, author_id: input.actorId, body: input.body }).select("id,incident_id,created_at").single();
  if (error?.code === "23503") throw new IncidentNotFoundError("INCIDENT_NOT_FOUND");
  if (error || !data) throw new Error("INCIDENT_NOTE_CREATE_FAILED");
  return data;
}

export async function resolveOperationalIncident(input: { incidentId: string; actorId: string }) {
  const client = createSupabaseAdminClient();
  const { data, error } = await client.from("operational_incidents").update({ status: "resolved", resolved_by: input.actorId, resolved_at: new Date().toISOString() }).eq("id", input.incidentId).eq("status", "open").select("id,status,resolved_at").maybeSingle();
  if (error) throw new Error("INCIDENT_RESOLVE_FAILED");
  if (data) return data;
  const { data: existing, error: existingError } = await client.from("operational_incidents").select("id,status").eq("id", input.incidentId).maybeSingle();
  if (existingError || !existing) throw new IncidentNotFoundError("INCIDENT_NOT_FOUND");
  throw new IncidentStateError("INCIDENT_ALREADY_RESOLVED");
}
