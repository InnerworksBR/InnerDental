import { generateSlots, overlaps, type TimeInterval, type TimePeriod } from "@/domain/availability/slots";

export type AvailabilityException = {
  type: "available" | "blocked" | "holiday" | "vacation";
  startTime: string | null;
  endTime: string | null;
};

export class CalendarUnavailableError extends Error {
  constructor() {
    super("Calendar availability could not be verified");
  }
}

function appliesToSlot(exception: AvailabilityException, slot: TimeInterval): boolean {
  if (!exception.startTime || !exception.endTime) return true;
  const date = slot.startAt.slice(0, 10);
  return overlaps(slot, {
    startAt: new Date(`${date}T${exception.startTime}-03:00`).toISOString(),
    endAt: new Date(`${date}T${exception.endTime}-03:00`).toISOString(),
  });
}

export function calculateAvailability(input: {
  date: string;
  periods: TimePeriod[];
  exceptions: AvailabilityException[];
  busyIntervals: TimeInterval[];
  now?: Date;
  minDate?: string;
  maxDate?: string;
}): TimeInterval[] {
  const base = generateSlots(input);
  const dayBlocked = input.exceptions.some((entry) =>
    ["blocked", "holiday", "vacation"].includes(entry.type) && !entry.startTime,
  );
  if (dayBlocked) return [];

  return base.filter((slot) => {
    const blocked = input.exceptions.some((entry) =>
      ["blocked", "holiday", "vacation"].includes(entry.type) && appliesToSlot(entry, slot),
    );
    const explicitlyAvailable = input.exceptions.some((entry) => entry.type === "available" && appliesToSlot(entry, slot));
    const calendarBusy = input.busyIntervals.some((busy) => overlaps(slot, busy));
    return (!blocked || explicitlyAvailable) && !calendarBusy;
  });
}
