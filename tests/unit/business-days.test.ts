import { describe, expect, it } from "vitest";
import { bookingBusinessDays, isBusinessDate, minimumBookingDate } from "@/domain/availability/business-days";

describe("booking business days", () => {
  it("starts two business days ahead and never offers weekends", () => {
    const now = new Date("2026-07-23T15:00:00.000Z"); // quinta-feira em São Paulo
    expect(minimumBookingDate(now)).toBe("2026-07-27");
    expect(bookingBusinessDays(now).map((date) => date.toISOString().slice(0, 10))).toEqual([
      "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31", "2026-08-03",
    ]);
  });

  it("counts Monday and Tuesday when today is Friday", () => {
    expect(minimumBookingDate(new Date("2026-07-24T15:00:00.000Z"))).toBe("2026-07-28");
  });

  it.each(["2026-07-25", "2026-07-26"])("rejects weekend date %s", (date) => {
    expect(isBusinessDate(date)).toBe(false);
  });
});
