import { z } from "zod";

const uuid = z.string().uuid();
const nullableText = (max: number) => z.union([z.string().trim().max(max), z.null()]).transform((value) => value && value.length > 0 ? value : null);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido");

export function normalizeCatalogTerm(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

export type SchedulePeriod = { weekday: number; startTime: string; endTime: string };

export function scheduleHasOverlap(periods: SchedulePeriod[]): boolean {
  return periods.some((period, index) => periods.some((other, otherIndex) => index !== otherIndex
    && period.weekday === other.weekday
    && period.startTime < other.endTime
    && other.startTime < period.endTime));
}

export type AliasConflictCode = "ALIAS_DUPLICADO" | "ALIAS_CONFLITA_COM_PLANO" | "ALIAS_JA_UTILIZADO" | "PLANO_CONFLITA_COM_ALIAS";

export function findAliasConflict(input: {
  planId?: string;
  planName: string;
  proposedAliases: string[];
  plans: Array<{ id: string; name: string }>;
  aliases: Array<{ insurance_plan_id: string; alias: string; active: boolean }>;
}): AliasConflictCode | null {
  const proposed = input.proposedAliases.map(normalizeCatalogTerm);
  if (new Set(proposed).size !== proposed.length) return "ALIAS_DUPLICADO";
  const canonicalNames = new Set(input.plans.map((entry) => normalizeCatalogTerm(entry.name)));
  if (proposed.some((alias) => canonicalNames.has(alias))) return "ALIAS_CONFLITA_COM_PLANO";
  if (input.aliases.some((entry) => entry.active && entry.insurance_plan_id !== input.planId && proposed.includes(normalizeCatalogTerm(entry.alias)))) return "ALIAS_JA_UTILIZADO";
  const planName = normalizeCatalogTerm(input.planName);
  if (input.aliases.some((entry) => entry.active && entry.insurance_plan_id !== input.planId && normalizeCatalogTerm(entry.alias) === planName)) return "PLANO_CONFLITA_COM_ALIAS";
  return null;
}

const procedure = z.object({
  action: z.literal("save_procedure"), id: uuid.optional(), name: z.string().trim().min(1).max(160),
  description: nullableText(2000), onlineBooking: z.boolean(), active: z.boolean(),
});

const plan = z.object({
  action: z.literal("save_plan"), id: uuid.optional(), name: z.string().trim().min(1).max(120),
  instructions: nullableText(2000), active: z.boolean(), aliases: z.array(z.string().trim().min(1).max(120)).max(30),
});

const coverage = z.object({
  action: z.literal("save_coverage"), procedureId: uuid, insurancePlanId: uuid,
  accepted: z.boolean(), instructions: nullableText(2000),
});

const professional = z.object({
  action: z.literal("save_professional"), id: uuid.optional(), name: z.string().trim().min(1).max(160),
  calendarId: z.string().trim().min(1).max(500), active: z.boolean(),
});

const schedule = z.object({
  action: z.literal("save_schedule"), professionalId: uuid,
  periods: z.array(z.object({ weekday: z.number().int().min(0).max(6), startTime: time, endTime: time }).refine((value) => value.startTime < value.endTime, "O início deve ser anterior ao fim")).max(28),
}).refine((value) => !scheduleHasOverlap(value.periods), { message: "Os períodos não podem se sobrepor", path: ["periods"] });

const exception = z.object({
  action: z.literal("save_exception"), id: uuid.optional(), professionalId: uuid,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startTime: z.union([time, z.null()]), endTime: z.union([time, z.null()]),
  type: z.enum(["available", "blocked", "holiday", "vacation"]), description: nullableText(500), active: z.boolean(),
}).refine((value) => (value.startTime === null && value.endTime === null) || (value.startTime !== null && value.endTime !== null && value.startTime < value.endTime), { message: "Informe início e fim válidos", path: ["startTime"] });

const faq = z.object({
  action: z.literal("save_faq"), id: uuid.optional(), category: z.string().trim().min(1).max(80),
  question: z.string().trim().min(1).max(500), answer: z.string().trim().min(1).max(4000), active: z.boolean(),
});

const patient = z.object({
  action: z.literal("save_patient"), id: uuid,
  name: z.union([z.string().trim().min(1).max(160), z.null()]), insurancePlanId: z.union([uuid, z.null()]),
});

const invite = z.object({
  action: z.literal("invite_access"), email: z.string().trim().email().max(320), role: z.enum(["owner", "operator"]),
});

const access = z.object({
  action: z.literal("save_access"), userId: uuid, role: z.enum(["owner", "operator"]), active: z.boolean(),
});

export const managementCommandSchema = z.discriminatedUnion("action", [procedure, plan, coverage, professional, schedule, exception, faq, patient, invite, access]);
export type ManagementCommand = z.infer<typeof managementCommandSchema>;
