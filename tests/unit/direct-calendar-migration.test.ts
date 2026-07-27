import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202607270017_direct_calendar_appointments.sql", "utf8");

describe("direct Calendar appointment migration", () => {
  it("tracks imported Calendar events separately", () => {
    expect(sql).toContain("calendar_origin text not null default 'system'");
    expect(sql).toContain("calendar_origin in ('system', 'direct')");
    expect(sql).toContain("sync_direct_calendar_appointment");
  });

  it("does not overwrite an existing patient name and resets confirmations after material changes", () => {
    expect(sql).toContain("set name = coalesce(public.patients.name, excluded.name)");
    expect(sql).toContain("attendance_confirmation_status = case when reset_confirmation then 'pending'");
  });

  it("does not emit extra lifecycle messages for Calendar-owned changes", () => {
    expect(sql).toContain("if new.calendar_origin = 'direct' then return new; end if");
  });

  it("reconciles only direct active imports in a bounded range", () => {
    expect(sql).toContain("calendar_origin = 'direct'");
    expect(sql).toContain("p_range_end - p_range_start > interval '31 days'");
    expect(sql).toContain("not (calendar_event_id = any(coalesce(p_seen_event_ids, array[]::text[])))");
  });

  it("restricts synchronization functions to the service role", () => {
    expect(sql).toContain("revoke all on function public.sync_direct_calendar_appointment");
    expect(sql).toContain("grant execute on function public.reconcile_direct_calendar_appointments");
  });
});
