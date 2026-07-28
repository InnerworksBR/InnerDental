import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../supabase/migrations/202607280019_whatsapp_plan_triage.sql", import.meta.url), "utf8");

describe("WhatsApp plan triage migration", () => {
  it("stores a time-bounded plan gate per phone with forced RLS", () => {
    expect(sql).toContain("create table public.whatsapp_plan_triage_sessions");
    expect(sql).toContain("status in ('awaiting_plan', 'accepted', 'rejected')");
    expect(sql).toContain("insurance_plan_id uuid references public.insurance_plans");
    expect(sql).toContain("alter table public.whatsapp_plan_triage_sessions force row level security");
  });

  it("allows the worker to audit all plan-triage outcomes", () => {
    expect(sql).toContain("'plan_requested', 'plan_rejected', 'plan_rejected_caixa'");
    expect(sql).toContain("'appointment_confirmed', 'appointment_already_confirmed'");
  });
});
