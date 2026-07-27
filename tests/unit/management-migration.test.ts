import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202607270014_management_soft_deactivation.sql", "utf8");

describe("management soft-deactivation migration", () => {
  it("adds active flags without deleting historical rows", () => {
    expect(sql).toContain("alter table public.insurance_aliases");
    expect(sql).toContain("alter table public.availability_exceptions");
    expect(sql.match(/active boolean not null default true/g)).toHaveLength(2);
    expect(sql.toLowerCase()).not.toContain("delete from");
    expect(sql.toLowerCase()).not.toContain("drop table");
  });

  it("replaces weekly rules atomically inside PostgreSQL", () => {
    expect(sql).toContain("function public.replace_availability_rules");
    expect(sql).toContain("update public.availability_rules");
    expect(sql).toContain("jsonb_to_recordset");
    expect(sql).toContain("on conflict (professional_id, weekday, start_time, end_time)");
  });
});
