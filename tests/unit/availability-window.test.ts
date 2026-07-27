import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfessionalCalendar: vi.fn(),
  getRulesAndExceptionsForDates: vi.fn(),
  listBusyIntervals: vi.fn(),
}));

vi.mock("@/lib/availability/repository", () => ({
  getProfessionalCalendar: mocks.getProfessionalCalendar,
  getRulesAndExceptionsForDates: mocks.getRulesAndExceptionsForDates,
}));

vi.mock("@/integrations/google-calendar/http-gateway", () => ({
  GoogleCalendarHttpGateway: class {
    listBusyIntervals = mocks.listBusyIntervals;
  },
}));

import { getAvailabilityWindow } from "@/lib/availability/service";

describe("availability window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProfessionalCalendar.mockResolvedValue("calendar@example.com");
    mocks.getRulesAndExceptionsForDates.mockResolvedValue({
      rules: [3, 4, 5].map((weekday) => ({ weekday, start_time: "09:00", end_time: "10:00" })),
      exceptions: [{ date: "2026-07-29", type: "blocked", start_time: null, end_time: null }],
    });
    mocks.listBusyIntervals.mockResolvedValue([
      { startAt: "2026-07-31T03:00:00.000Z", endAt: "2026-08-01T03:00:00.000Z" },
    ]);
  });

  it("loads Calendar once and returns empty slots for blocked and fully booked days", async () => {
    const days = await getAvailabilityWindow(
      "1f7beaf5-94b1-4bdb-9aef-9874fc902987",
      ["2026-07-29", "2026-07-30", "2026-07-31"],
      "token",
      new Date("2026-07-23T15:00:00.000Z"),
    );

    expect(days.map((day) => [day.date, day.slots.length])).toEqual([
      ["2026-07-29", 0],
      ["2026-07-30", 4],
      ["2026-07-31", 0],
    ]);
    expect(mocks.listBusyIntervals).toHaveBeenCalledOnce();
    expect(mocks.listBusyIntervals).toHaveBeenCalledWith("calendar@example.com", {
      startAt: "2026-07-29T03:00:00.000Z",
      endAt: "2026-08-01T03:00:00.000Z",
    });
    expect(mocks.getRulesAndExceptionsForDates).toHaveBeenCalledOnce();
  });
});
