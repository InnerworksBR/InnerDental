import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../supabase/migrations/202607280022_insurance_plan_aliases.sql", import.meta.url), "utf8");

describe("insurance plan aliases migration", () => {
  it("keeps Transmontano active and registers the Tramontano spelling idempotently", () => {
    expect(sql).toContain("values ('Transmontano', true, null)");
    expect(sql).toContain("select id, 'Tramontano', true");
    expect(sql).toContain("on conflict (insurance_plan_id, alias) do update");
    expect(sql).toContain("set active = true");
    expect(sql).toContain("update public.whatsapp_plan_triage_sessions");
    expect(sql).toContain("where status = 'rejected'");
    expect(sql).toContain("set expires_at = now()");
  });
});
