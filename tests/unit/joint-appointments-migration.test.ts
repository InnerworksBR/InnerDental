import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202607270013_joint_appointments.sql", "utf8");

describe("joint appointments migration", () => {
  it("allows only supported 15 and 30 minute durations", () => {
    expect(sql).toContain("appointments_supported_duration");
    expect(sql).toContain("slot_holds_supported_duration");
    expect(sql).toContain("interval '15 minutes', interval '30 minutes'");
  });

  it("rejects overlapping active appointments and holds", () => {
    expect(sql).toContain("appointments_no_active_overlap");
    expect(sql).toContain("slot_holds_no_active_overlap");
    expect(sql).toContain("tstzrange(start_at, end_at, '[)') with &&");
    expect(sql).toContain("exclusion_violation");
  });
});
