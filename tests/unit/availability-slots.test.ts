import { describe, expect, it } from "vitest";
import { calculateAvailability } from "@/domain/availability/service";
import { generateSlots, intervalForSlots, overlaps, slotCountForInterval, slotFor, withConsecutiveSlots } from "@/domain/availability/slots";

describe("availability slots", () => {
  it("generates 15-minute slots for multiple periods and skips elapsed slots", () => {
    const slots = generateSlots({
      date: "2026-07-20", periods: [{ startTime: "09:00", endTime: "09:30" }, { startTime: "13:00", endTime: "13:30" }],
      now: new Date("2026-07-20T12:01:00.000Z"),
    });
    expect(slots.map((slot) => slot.startAt)).toEqual([
      "2026-07-20T12:15:00.000Z", "2026-07-20T16:00:00.000Z", "2026-07-20T16:15:00.000Z",
    ]);
  });

  it("honours scheduling date limits", () => {
    expect(generateSlots({ date: "2026-07-20", periods: [{ startTime: "09:00", endTime: "09:15" }], minDate: "2026-07-21" })).toEqual([]);
  });

  it("uses strict overlap boundaries", () => {
    expect(overlaps(slotFor("2026-07-20", "10:00"), { startAt: "2026-07-20T13:15:00.000Z", endAt: "2026-07-20T13:30:00.000Z" })).toBe(false);
    expect(overlaps(slotFor("2026-07-20", "10:00"), { startAt: "2026-07-20T13:10:00.000Z", endAt: "2026-07-20T13:40:00.000Z" })).toBe(true);
  });

  it("blocks each slot touched by a Calendar event", () => {
    const slots = calculateAvailability({
      date: "2026-07-20", periods: [{ startTime: "10:00", endTime: "11:00" }], now: new Date("2026-07-20T00:00:00.000Z"),
      exceptions: [], busyIntervals: [{ startAt: "2026-07-20T13:10:00.000Z", endAt: "2026-07-20T13:40:00.000Z" }],
    });
    expect(slots.map((slot) => slot.startAt)).toEqual(["2026-07-20T13:45:00.000Z"]);
  });

  it("blocks all slots for all-day and explicit blocked exceptions", () => {
    const input = { date: "2026-07-20", periods: [{ startTime: "09:00", endTime: "10:00" }], now: new Date("2026-07-20T00:00:00.000Z"), busyIntervals: [] };
    expect(calculateAvailability({ ...input, exceptions: [{ type: "vacation" as const, startTime: null, endTime: null }] })).toEqual([]);
    expect(calculateAvailability({ ...input, exceptions: [{ type: "blocked" as const, startTime: "09:15", endTime: "09:30" }] }).map((slot) => slot.startAt))
      .toEqual(["2026-07-20T12:00:00.000Z", "2026-07-20T12:30:00.000Z", "2026-07-20T12:45:00.000Z"]);
  });

  it("never lets an available exception override a busy Calendar interval", () => {
    const slots = calculateAvailability({
      date: "2026-07-20",
      periods: [{ startTime: "09:00", endTime: "09:15" }],
      now: new Date("2026-07-20T00:00:00.000Z"),
      exceptions: [{ type: "available", startTime: "09:00", endTime: "09:15" }],
      busyIntervals: [{ startAt: "2026-07-20T12:00:00.000Z", endAt: "2026-07-20T12:15:00.000Z" }],
    });

    expect(slots).toEqual([]);
  });

  it("offers a two-person start only when the following slot is consecutive", () => {
    const slots = [slotFor("2026-07-20", "09:00"), slotFor("2026-07-20", "09:15"), slotFor("2026-07-20", "10:00")];
    expect(withConsecutiveSlots(slots, 2).map((slot) => slot.startAt)).toEqual(["2026-07-20T12:00:00.000Z"]);
    expect(intervalForSlots("2026-07-20", "09:00", 2)).toEqual({
      startAt: "2026-07-20T12:00:00.000Z",
      endAt: "2026-07-20T12:30:00.000Z",
    });
    expect(slotCountForInterval(intervalForSlots("2026-07-20", "09:00", 2))).toBe(2);
  });
});
