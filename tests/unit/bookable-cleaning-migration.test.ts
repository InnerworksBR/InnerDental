import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../supabase/migrations/202607280021_bookable_cleaning_procedure.sql", import.meta.url), "utf8");

describe("bookable cleaning procedure migration", () => {
  it("registers cleaning as an active online-bookable procedure idempotently", () => {
    expect(sql).toContain("values ('Limpeza'");
    expect(sql).toContain("true, true");
    expect(sql).toContain("on conflict (name) do update");
    expect(sql).toContain("online_booking = excluded.online_booking");
  });
});
