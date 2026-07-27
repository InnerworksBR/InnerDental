import { describe, expect, it } from "vitest";
import { findAliasConflict, managementCommandSchema, normalizeCatalogTerm, scheduleHasOverlap } from "@/domain/admin/management";

const professionalId = "1f7beaf5-94b1-4bdb-9aef-9874fc902987";

describe("management domain", () => {
  it("normalizes accents, casing and spacing for catalog comparisons", () => {
    expect(normalizeCatalogTerm("  São   Vicente  ")).toBe("sao vicente");
  });

  it("rejects ambiguous aliases against canonical plans and aliases", () => {
    const base = {
      planId: "plan-a",
      planName: "Plano A",
      plans: [{ id: "plan-b", name: "Bradesco Dental" }],
      aliases: [{ insurance_plan_id: "plan-b", alias: "Odonto Prev", active: true }],
    };
    expect(findAliasConflict({ ...base, proposedAliases: ["brádesco dental"] })).toBe("ALIAS_CONFLITA_COM_PLANO");
    expect(findAliasConflict({ ...base, proposedAliases: ["Odonto   Prev"] })).toBe("ALIAS_JA_UTILIZADO");
    expect(findAliasConflict({ ...base, proposedAliases: ["Unna", "UNNA"] })).toBe("ALIAS_DUPLICADO");
  });

  it("detects schedule overlap and accepts separated periods", () => {
    expect(scheduleHasOverlap([{ weekday: 1, startTime: "08:00", endTime: "12:00" }, { weekday: 1, startTime: "11:45", endTime: "13:00" }])).toBe(true);
    expect(scheduleHasOverlap([{ weekday: 1, startTime: "08:00", endTime: "12:00" }, { weekday: 1, startTime: "14:00", endTime: "18:00" }])).toBe(false);
  });

  it("validates schedule and exception boundaries", () => {
    expect(managementCommandSchema.safeParse({ action: "save_schedule", professionalId, periods: [{ weekday: 1, startTime: "12:00", endTime: "08:00" }] }).success).toBe(false);
    expect(managementCommandSchema.safeParse({ action: "save_exception", professionalId, date: "2026-07-30", startTime: "09:00", endTime: null, type: "blocked", description: null, active: true }).success).toBe(false);
  });
});
