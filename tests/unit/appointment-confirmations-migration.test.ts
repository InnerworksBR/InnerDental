import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202607270016_appointment_confirmations.sql", "utf8");

describe("appointment confirmation migration", () => {
  it("keeps attendance confirmation separate and resets it on reschedule", () => {
    expect(sql).toContain("attendance_confirmation_status text not null default 'pending'");
    expect(sql).toContain("before update of start_at on public.appointments");
    expect(sql).toContain("new.attendance_confirmation_status := 'pending'");
  });

  it("queues the current schedule version for 20h on the previous São Paulo day", () => {
    expect(sql).toContain("time '20:00'");
    expect(sql).toContain("at time zone 'America/Sao_Paulo'");
    expect(sql).toContain("'scheduled_start_at', new.start_at");
    expect(sql).toContain("extract(epoch from new.start_at)::bigint::text");
    expect(sql).toContain("local_appointment_date <= (now() at time zone 'America/Sao_Paulo')::date");
    expect(sql).toContain("on conflict (dedupe_key) do nothing");
  });

  it("confirms atomically by phone without cancelling unanswered appointments", () => {
    expect(sql).toContain("confirm_upcoming_appointment_by_phone");
    expect(sql).toContain("for update of appointment");
    expect(sql).toContain("attendance_confirmation_status = 'confirmed'");
    expect(sql).not.toMatch(/set\s+status\s*=\s*'cancelled'/i);
  });

  it("queues one configurable morning summary per local date", () => {
    expect(sql).toContain("enqueue_daily_confirmation_summary(p_summary_hour integer default 8)");
    expect(sql).toContain("'clinic.daily_confirmation_summary:' || local_now::date::text");
    expect(sql).toContain("get_daily_confirmation_summary");
    expect(sql).toContain("appointment.status in ('scheduled', 'rescheduled')");
  });

  it("keeps operational RPCs restricted to the service role", () => {
    expect(sql).toContain("revoke all on function public.confirm_upcoming_appointment_by_phone(text) from public");
    expect(sql).toContain("grant execute on function public.get_daily_confirmation_summary(date) to service_role");
  });
});
