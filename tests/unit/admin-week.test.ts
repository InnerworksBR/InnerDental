import { describe, expect, it } from "vitest";
import { clinicDateFromInstant, weekDatesContaining } from "@/domain/admin/week";

describe("admin week", () => {
  it("returns the full Monday-to-Sunday week for any date inside it", () => {
    const expected = [
      "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02",
    ];
    expect(weekDatesContaining("2026-07-27")).toEqual(expected);
    expect(weekDatesContaining("2026-08-02")).toEqual(expected);
  });

  it("groups instants by the clinic date instead of UTC", () => {
    expect(clinicDateFromInstant("2026-07-28T02:30:00.000Z")).toBe("2026-07-27");
    expect(clinicDateFromInstant("2026-07-28T03:00:00.000Z")).toBe("2026-07-28");
  });
});
