import { describe, expect, it } from "vitest";
import { allDayBlockEventPayload } from "@/domain/appointments/service";

describe("allDayBlockEventPayload", () => {
  it("uses Google all-day dates with an exclusive next-day end", () => {
    expect(allDayBlockEventPayload({ blockId: "block-1", date: "2026-07-31", professionalName: "Dra. Priscila" })).toMatchObject({
      summary: "Bloqueio administrativo | Dra. Priscila",
      start: { date: "2026-07-31" },
      end: { date: "2026-08-01" },
    });
  });
});
