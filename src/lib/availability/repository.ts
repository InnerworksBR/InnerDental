import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type RuleRow = { weekday: number; start_time: string; end_time: string };
export type ExceptionRow = { type: "available" | "blocked" | "holiday" | "vacation"; start_time: string | null; end_time: string | null };
export type DatedExceptionRow = ExceptionRow & { date: string };

export async function getProfessionalCalendar(professionalId: string) {
  const client = createSupabaseAdminClient();
  const { data, error } = await client.from("professionals").select("calendar_id").eq("id", professionalId).eq("active", true).maybeSingle();
  if (error || !data) return null;
  const professionalCalendarId = data.calendar_id?.trim();
  if (professionalCalendarId && professionalCalendarId !== "CONFIGURE_GOOGLE_CALENDAR_ID") {
    return professionalCalendarId;
  }
  return process.env.GOOGLE_CALENDAR_ID?.trim() || null;
}

export async function getRulesAndExceptions(professionalId: string, date: string, weekday: number) {
  const client = createSupabaseAdminClient();
  const [rules, exceptions] = await Promise.all([
    client.from("availability_rules").select("weekday,start_time,end_time").eq("professional_id", professionalId).eq("weekday", weekday).eq("active", true),
    client.from("availability_exceptions").select("type,start_time,end_time").eq("professional_id", professionalId).eq("date", date).eq("active", true),
  ]);
  if (rules.error || exceptions.error) throw new Error("AVAILABILITY_READ_FAILED");
  return { rules: (rules.data ?? []) as RuleRow[], exceptions: (exceptions.data ?? []) as ExceptionRow[] };
}

export async function getRulesAndExceptionsForDates(professionalId: string, dates: string[]) {
  if (dates.length === 0) return { rules: [] as RuleRow[], exceptions: [] as DatedExceptionRow[] };

  const client = createSupabaseAdminClient();
  const [rules, exceptions] = await Promise.all([
    client.from("availability_rules").select("weekday,start_time,end_time").eq("professional_id", professionalId).eq("active", true),
    client.from("availability_exceptions").select("date,type,start_time,end_time").eq("professional_id", professionalId).in("date", dates).eq("active", true),
  ]);
  if (rules.error || exceptions.error) throw new Error("AVAILABILITY_READ_FAILED");
  return {
    rules: (rules.data ?? []) as RuleRow[],
    exceptions: (exceptions.data ?? []) as DatedExceptionRow[],
  };
}

export async function createSlotHold(input: { professionalId: string; startAt: string; endAt: string; phone: string; sessionId: string }) {
  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc("create_slot_hold", {
    p_professional_id: input.professionalId,
    p_start_at: input.startAt,
    p_end_at: input.endAt,
    p_phone: input.phone,
    p_session_id: input.sessionId,
  });
  if (error) throw new Error("HOLD_CREATE_FAILED");
  return data as string | null;
}

export async function consumeSlotHold(input: { holdId: string; professionalId: string; startAt: string; endAt: string; phone: string; sessionId: string }) {
  const { data, error } = await createSupabaseAdminClient().rpc("consume_slot_hold", {
    p_hold_id: input.holdId,
    p_professional_id: input.professionalId,
    p_start_at: input.startAt,
    p_end_at: input.endAt,
    p_phone: input.phone,
    p_session_id: input.sessionId,
  });
  if (error) throw new Error("HOLD_CONSUME_FAILED");
  return data === true;
}
