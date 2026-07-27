import { describe, expect, it } from "vitest";
import { parseDirectCalendarAppointment } from "../../src/domain/appointments/calendar-import.ts";
import type { CalendarEvent } from "../../src/integrations/google-calendar/port.ts";

const now = new Date("2026-07-27T12:00:00.000Z");
const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "calendar-event-1",
  summary: "Maria Silva — (13) 99999-9999",
  startAt: "2026-07-28T12:00:00.000Z",
  endAt: "2026-07-28T12:30:00.000Z",
  allDay: false,
  blocksTime: true,
  ...overrides,
});

describe("direct Calendar appointment parser", () => {
  it("extracts a patient and normalizes a trailing Brazilian phone", () => {
    expect(parseDirectCalendarAppointment(event(), now)).toEqual({
      calendarEventId: "calendar-event-1",
      patientName: "Maria Silva",
      phone: "5513999999999",
      startAt: "2026-07-28T12:00:00.000Z",
      endAt: "2026-07-28T12:30:00.000Z",
    });
  });

  it("accepts the doctor's usual unformatted title", () => {
    expect(parseDirectCalendarAppointment(event({
      summary: "Maria Silva 13991743380",
    }), now)).toMatchObject({
      patientName: "Maria Silva",
      phone: "5513991743380",
    });
  });

  it.each([
    { summary: "Maria Silva" },
    { allDay: true },
    { blocksTime: false },
    { endAt: "2026-07-28T12:45:00.000Z" },
    { startAt: "2026-07-27T11:00:00.000Z", endAt: "2026-07-27T11:30:00.000Z" },
  ])("ignores events that cannot safely become appointments: %o", (overrides) => {
    expect(parseDirectCalendarAppointment(event(overrides), now)).toBeNull();
  });
});
