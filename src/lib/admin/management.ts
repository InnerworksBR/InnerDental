import "server-only";

import type { ManagementCommand } from "@/domain/admin/management";
import { normalizeCatalogTerm } from "@/domain/admin/management";
import { maskPhone } from "@/lib/admin/repository";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export class ManagementConflictError extends Error {
  constructor(readonly code: string) { super(code); }
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function changedFields(previous: Record<string, unknown> | null, next: Record<string, unknown>): string[] {
  if (!previous) return Object.keys(next).filter((key) => next[key] !== undefined);
  return Object.keys(next).filter((key) => JSON.stringify(previous[key] ?? null) !== JSON.stringify(next[key] ?? null));
}

async function auditChange(input: { actorId: string; entity: string; entityId?: string | null; action: string; fields: string[]; metadata?: Record<string, Json> }) {
  const { error } = await createSupabaseAdminClient().from("audit_logs").insert({
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId ?? null,
    source: "internal_management",
    actor_id: input.actorId,
    metadata: { changed_fields: input.fields, ...input.metadata },
  });
  if (error) throw new Error("MANAGEMENT_AUDIT_FAILED");
}

async function existingRow(table: string, id: string) {
  const { data, error } = await createSupabaseAdminClient().from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("MANAGEMENT_READ_FAILED");
  if (!data) throw new ManagementConflictError("REGISTRO_NAO_ENCONTRADO");
  return data as Record<string, unknown>;
}

async function ensureNormalizedName(table: "procedures" | "insurance_plans", name: string, ownId?: string) {
  const { data, error } = await createSupabaseAdminClient().from(table).select("id,name");
  if (error) throw new Error("MANAGEMENT_READ_FAILED");
  const normalized = normalizeCatalogTerm(name);
  if ((data ?? []).some((row) => row.id !== ownId && normalizeCatalogTerm(row.name) === normalized)) {
    throw new ManagementConflictError("NOME_JA_CADASTRADO");
  }
}

export async function listManagementSnapshot(patientSearch = "") {
  const client = createSupabaseAdminClient();
  const cleanSearch = patientSearch.normalize("NFC").replace(/[^\p{L}\p{N} ]/gu, "").trim().slice(0, 80);
  const digits = cleanSearch.replace(/\D/g, "");
  let patientQuery = client.from("patients").select("id,name,phone,insurance_plan_id,updated_at,insurance_plans(name)");
  if (cleanSearch) patientQuery = patientQuery.or(`name.ilike.%${cleanSearch}%,phone.like.%${digits || cleanSearch}%`);
  patientQuery = patientQuery.order("updated_at", { ascending: false }).limit(100);
  const [procedures, plans, aliases, coverages, professionals, rules, exceptions, faqs, patients, appointments, profiles, audits, authUsers] = await Promise.all([
    client.from("procedures").select("id,name,description,online_booking,active,updated_at").order("name"),
    client.from("insurance_plans").select("id,name,instructions,active,updated_at").order("name"),
    client.from("insurance_aliases").select("id,insurance_plan_id,alias,active,is_canonical,created_at").order("alias"),
    client.from("procedure_coverage").select("id,procedure_id,insurance_plan_id,accepted,instructions,updated_at"),
    client.from("professionals").select("id,name,calendar_id,timezone,active,updated_at").order("name"),
    client.from("availability_rules").select("id,professional_id,weekday,start_time,end_time,active").order("weekday").order("start_time"),
    client.from("availability_exceptions").select("id,professional_id,date,start_time,end_time,type,description,active,updated_at").order("date", { ascending: false }).limit(100),
    client.from("faq_entries").select("id,category,question,answer,active,updated_at").order("category").order("question"),
    patientQuery,
    client.from("appointments").select("patient_id,start_at,status").order("start_at", { ascending: false }).limit(1000),
    client.from("internal_profiles").select("user_id,role,active,created_at,updated_at").order("created_at"),
    client.from("audit_logs").select("id,action,entity,entity_id,source,actor_id,metadata,created_at").eq("source", "internal_management").order("created_at", { ascending: false }).limit(50),
    client.auth.admin.listUsers({ page: 1, perPage: 100 }),
  ]);
  const queryErrors = [procedures, plans, aliases, coverages, professionals, rules, exceptions, faqs, patients, appointments, profiles, audits].filter((result) => result.error);
  if (queryErrors.length || authUsers.error) throw new Error("MANAGEMENT_SNAPSHOT_FAILED");

  const appointmentRows = appointments.data ?? [];
  const emails = new Map((authUsers.data.users ?? []).map((user) => [user.id, user.email ?? null]));
  return {
    procedures: procedures.data ?? [],
    plans: (plans.data ?? []).map((plan) => ({
      ...plan,
      aliases: (aliases.data ?? []).filter((alias) => alias.insurance_plan_id === plan.id && !alias.is_canonical),
      coverages: (coverages.data ?? []).filter((coverage) => coverage.insurance_plan_id === plan.id),
    })),
    professionals: (professionals.data ?? []).map((professional) => ({
      ...professional,
      rules: (rules.data ?? []).filter((rule) => rule.professional_id === professional.id),
      exceptions: (exceptions.data ?? []).filter((entry) => entry.professional_id === professional.id),
    })),
    faqs: faqs.data ?? [],
    patients: (patients.data ?? []).map((patient) => {
      const history = appointmentRows.filter((appointment) => appointment.patient_id === patient.id);
      const relatedPlan = Array.isArray(patient.insurance_plans) ? patient.insurance_plans[0] : patient.insurance_plans;
      return {
        id: patient.id,
        name: patient.name,
        maskedPhone: maskPhone(patient.phone),
        insurancePlanId: patient.insurance_plan_id,
        insurancePlanName: relatedPlan?.name ?? null,
        appointmentCount: history.length,
        lastAppointmentAt: history[0]?.start_at ?? null,
        updatedAt: patient.updated_at,
      };
    }),
    team: (profiles.data ?? []).map((profile) => ({ ...profile, email: emails.get(profile.user_id) ?? null })),
    audits: audits.data ?? [],
  };
}

async function saveProcedure(command: Extract<ManagementCommand, { action: "save_procedure" }>, actorId: string) {
  await ensureNormalizedName("procedures", command.name, command.id);
  const values = { name: command.name, description: command.description, online_booking: command.onlineBooking, active: command.active };
  const previous = command.id ? await existingRow("procedures", command.id) : null;
  const query = command.id
    ? createSupabaseAdminClient().from("procedures").update(values).eq("id", command.id).select("id").single()
    : createSupabaseAdminClient().from("procedures").insert(values).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error("PROCEDURE_SAVE_FAILED");
  await auditChange({ actorId, entity: "procedures", entityId: data.id, action: command.id ? "update" : "insert", fields: changedFields(previous, values) });
  return data.id as string;
}

async function savePlan(command: Extract<ManagementCommand, { action: "save_plan" }>, actorId: string) {
  const values = { name: command.name, instructions: command.instructions, active: command.active };
  const previous = command.id ? await existingRow("insurance_plans", command.id) : null;
  const client = createSupabaseAdminClient();
  const saved = await client.rpc("save_insurance_plan_catalog", {
    p_plan_id: command.id ?? null,
    p_name: values.name,
    p_instructions: values.instructions,
    p_active: values.active,
    p_aliases: command.aliases,
  });
  if (saved.error || !saved.data) {
    const detail = `${saved.error?.message ?? ""} ${saved.error?.details ?? ""}`;
    if (/PLAN_(?:ALIAS_DUPLICATE|ALIAS_INVALID|CATALOG_CONFLICT)|duplicate key/i.test(detail)) {
      throw new ManagementConflictError("ALIAS_JA_UTILIZADO");
    }
    if (/PLAN_NOT_FOUND/i.test(detail)) throw new ManagementConflictError("REGISTRO_NAO_ENCONTRADO");
    throw new Error("PLAN_SAVE_FAILED");
  }
  const planId = saved.data as string;
  await auditChange({ actorId, entity: "insurance_plans", entityId: planId, action: command.id ? "update" : "insert", fields: [...changedFields(previous, values), "aliases"], metadata: { aliases: command.aliases } });
  return planId;
}

async function saveCoverage(command: Extract<ManagementCommand, { action: "save_coverage" }>, actorId: string) {
  const client = createSupabaseAdminClient();
  const previousResult = await client.from("procedure_coverage").select("*").eq("procedure_id", command.procedureId).eq("insurance_plan_id", command.insurancePlanId).maybeSingle();
  if (previousResult.error) throw new Error("MANAGEMENT_READ_FAILED");
  const values = { procedure_id: command.procedureId, insurance_plan_id: command.insurancePlanId, accepted: command.accepted, instructions: command.instructions };
  const { data, error } = await client.from("procedure_coverage").upsert(values, { onConflict: "procedure_id,insurance_plan_id" }).select("id").single();
  if (error) throw new Error("COVERAGE_SAVE_FAILED");
  await auditChange({ actorId, entity: "procedure_coverage", entityId: data.id, action: previousResult.data ? "update" : "insert", fields: changedFields(previousResult.data, values) });
  return data.id as string;
}

async function saveProfessional(command: Extract<ManagementCommand, { action: "save_professional" }>, actorId: string) {
  const client = createSupabaseAdminClient();
  const existingNames = await client.from("professionals").select("id,name,calendar_id");
  if (existingNames.error) throw new Error("MANAGEMENT_READ_FAILED");
  if ((existingNames.data ?? []).some((entry) => entry.id !== command.id && normalizeCatalogTerm(entry.name) === normalizeCatalogTerm(command.name))) throw new ManagementConflictError("NOME_JA_CADASTRADO");
  if ((existingNames.data ?? []).some((entry) => entry.id !== command.id && entry.calendar_id.trim().toLowerCase() === command.calendarId.toLowerCase())) throw new ManagementConflictError("CALENDARIO_JA_UTILIZADO");
  const values = { name: command.name, calendar_id: command.calendarId, timezone: "America/Sao_Paulo", active: command.active };
  const previous = command.id ? await existingRow("professionals", command.id) : null;
  const saved = command.id
    ? await client.from("professionals").update(values).eq("id", command.id).select("id").single()
    : await client.from("professionals").insert(values).select("id").single();
  if (saved.error) throw new Error("PROFESSIONAL_SAVE_FAILED");
  await auditChange({ actorId, entity: "professionals", entityId: saved.data.id, action: command.id ? "update" : "insert", fields: changedFields(previous, values) });
  return saved.data.id as string;
}

async function saveSchedule(command: Extract<ManagementCommand, { action: "save_schedule" }>, actorId: string) {
  const client = createSupabaseAdminClient();
  const current = await client.from("availability_rules").select("id,weekday,start_time,end_time,active").eq("professional_id", command.professionalId);
  if (current.error) throw new Error("MANAGEMENT_READ_FAILED");
  const saved = await client.rpc("replace_availability_rules", {
    p_professional_id: command.professionalId,
    p_periods: command.periods.map((period) => ({ weekday: period.weekday, start_time: period.startTime, end_time: period.endTime })),
  });
  if (saved.error) throw new Error("SCHEDULE_SAVE_FAILED");
  await auditChange({ actorId, entity: "availability_rules", entityId: command.professionalId, action: "replace", fields: ["periods"], metadata: { previous_count: current.data?.filter((entry) => entry.active).length ?? 0, next_count: command.periods.length } });
  return command.professionalId;
}

async function saveException(command: Extract<ManagementCommand, { action: "save_exception" }>, actorId: string) {
  const values = { professional_id: command.professionalId, date: command.date, start_time: command.startTime, end_time: command.endTime, type: command.type, description: command.description, active: command.active };
  const previous = command.id ? await existingRow("availability_exceptions", command.id) : null;
  const client = createSupabaseAdminClient();
  const saved = command.id
    ? await client.from("availability_exceptions").update(values).eq("id", command.id).select("id").single()
    : await client.from("availability_exceptions").insert(values).select("id").single();
  if (saved.error) throw new Error("EXCEPTION_SAVE_FAILED");
  await auditChange({ actorId, entity: "availability_exceptions", entityId: saved.data.id, action: command.id ? "update" : "insert", fields: changedFields(previous, values) });
  return saved.data.id as string;
}

async function saveFaq(command: Extract<ManagementCommand, { action: "save_faq" }>, actorId: string) {
  const values = { category: command.category, question: command.question, answer: command.answer, active: command.active };
  const previous = command.id ? await existingRow("faq_entries", command.id) : null;
  const client = createSupabaseAdminClient();
  const saved = command.id
    ? await client.from("faq_entries").update(values).eq("id", command.id).select("id").single()
    : await client.from("faq_entries").insert(values).select("id").single();
  if (saved.error) throw new Error("FAQ_SAVE_FAILED");
  await auditChange({ actorId, entity: "faq_entries", entityId: saved.data.id, action: command.id ? "update" : "insert", fields: changedFields(previous, values) });
  return saved.data.id as string;
}

async function savePatient(command: Extract<ManagementCommand, { action: "save_patient" }>, actorId: string) {
  const previous = await existingRow("patients", command.id);
  const values = { name: command.name, insurance_plan_id: command.insurancePlanId };
  const { error } = await createSupabaseAdminClient().from("patients").update(values).eq("id", command.id);
  if (error) throw new Error("PATIENT_SAVE_FAILED");
  await auditChange({ actorId, entity: "patients", entityId: command.id, action: "update", fields: changedFields(previous, values) });
  return command.id;
}

async function inviteAccess(command: Extract<ManagementCommand, { action: "invite_access" }>, actorId: string) {
  const client = createSupabaseAdminClient();
  const users = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error("ACCESS_LIST_FAILED");
  let user = users.data.users.find((entry) => entry.email?.toLowerCase() === command.email.toLowerCase()) ?? null;
  let invited = false;
  if (!user) {
    const invitation = await client.auth.admin.inviteUserByEmail(command.email);
    if (invitation.error || !invitation.data.user) throw new Error("ACCESS_INVITE_FAILED");
    user = invitation.data.user;
    invited = true;
  }
  const currentProfile = await client.from("internal_profiles").select("user_id,role,active").eq("user_id", user.id).maybeSingle();
  if (currentProfile.error) throw new Error("ACCESS_LIST_FAILED");
  if (currentProfile.data) return saveAccess({ action: "save_access", userId: user.id, role: command.role, active: true }, actorId);
  const saved = await client.from("internal_profiles").upsert({ user_id: user.id, role: command.role, active: true, created_by: actorId }, { onConflict: "user_id" });
  if (saved.error) {
    if (invited) await client.auth.admin.deleteUser(user.id);
    throw new Error("ACCESS_PROFILE_SAVE_FAILED");
  }
  await auditChange({ actorId, entity: "internal_profiles", entityId: user.id, action: invited ? "invite" : "activate", fields: ["role", "active"], metadata: { role: command.role } });
  return user.id;
}

async function saveAccess(command: Extract<ManagementCommand, { action: "save_access" }>, actorId: string) {
  if (command.userId === actorId && (!command.active || command.role !== "owner")) throw new ManagementConflictError("NAO_E_POSSIVEL_REVOGAR_O_PROPRIO_ACESSO");
  const previous = await createSupabaseAdminClient().from("internal_profiles").select("user_id,role,active").eq("user_id", command.userId).maybeSingle();
  if (previous.error || !previous.data) throw new ManagementConflictError("REGISTRO_NAO_ENCONTRADO");
  if (previous.data.role === "owner" && previous.data.active && (!command.active || command.role !== "owner")) {
    const owners = await createSupabaseAdminClient().from("internal_profiles").select("user_id", { count: "exact", head: true }).eq("role", "owner").eq("active", true);
    if (owners.error) throw new Error("ACCESS_LIST_FAILED");
    if ((owners.count ?? 0) <= 1) throw new ManagementConflictError("ULTIMO_PROPRIETARIO_NAO_PODE_SER_REVOGADO");
  }
  const values = { role: command.role, active: command.active };
  const { error } = await createSupabaseAdminClient().from("internal_profiles").update(values).eq("user_id", command.userId);
  if (error) throw new Error("ACCESS_PROFILE_SAVE_FAILED");
  await auditChange({ actorId, entity: "internal_profiles", entityId: command.userId, action: "update", fields: changedFields(previous.data, values), metadata: { role: command.role, active: command.active } });
  return command.userId;
}

export async function executeManagementCommand(command: ManagementCommand, actor: { userId: string; role: "owner" | "operator" }) {
  if (command.action === "save_patient") return { id: await savePatient(command, actor.userId) };
  if (actor.role !== "owner") throw new ManagementConflictError("SOMENTE_PROPRIETARIO_PODE_ALTERAR_CONFIGURACOES");
  switch (command.action) {
    case "save_procedure": return { id: await saveProcedure(command, actor.userId) };
    case "save_plan": return { id: await savePlan(command, actor.userId) };
    case "save_coverage": return { id: await saveCoverage(command, actor.userId) };
    case "save_professional": return { id: await saveProfessional(command, actor.userId) };
    case "save_schedule": return { id: await saveSchedule(command, actor.userId) };
    case "save_exception": return { id: await saveException(command, actor.userId) };
    case "save_faq": return { id: await saveFaq(command, actor.userId) };
    case "invite_access": return { id: await inviteAccess(command, actor.userId) };
    case "save_access": return { id: await saveAccess(command, actor.userId) };
  }
}
