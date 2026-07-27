export const SLOT_DURATION_MS = 15 * 60 * 1000;
const SAO_PAULO_OFFSET = "-03:00";
export type AppointmentSlotCount = 1 | 2;

export type TimePeriod = { startTime: string; endTime: string };
export type TimeInterval = { startAt: string; endAt: string };

function dateAtSaoPaulo(date: string, time: string): Date {
  return new Date(`${date}T${time}${SAO_PAULO_OFFSET}`);
}

export function overlaps(left: TimeInterval, right: TimeInterval): boolean {
  return new Date(left.startAt) < new Date(right.endAt) && new Date(left.endAt) > new Date(right.startAt);
}

export function slotFor(date: string, time: string): TimeInterval {
  return intervalForSlots(date, time, 1);
}

export function intervalForSlots(date: string, time: string, slotCount: AppointmentSlotCount): TimeInterval {
  const start = dateAtSaoPaulo(date, time);
  const end = new Date(start.getTime() + SLOT_DURATION_MS * slotCount);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export function slotCountForInterval(interval: TimeInterval): AppointmentSlotCount {
  const duration = new Date(interval.endAt).getTime() - new Date(interval.startAt).getTime();
  if (duration === SLOT_DURATION_MS) return 1;
  if (duration === SLOT_DURATION_MS * 2) return 2;
  throw new Error("UNSUPPORTED_APPOINTMENT_DURATION");
}

export function withConsecutiveSlots<T extends Pick<TimeInterval, "startAt">>(slots: T[], slotCount: AppointmentSlotCount): T[] {
  if (slotCount === 1) return slots;
  const starts = new Set(slots.map((slot) => new Date(slot.startAt).getTime()));
  return slots.filter((slot) => starts.has(new Date(slot.startAt).getTime() + SLOT_DURATION_MS));
}

export function generateSlots(input: {
  date: string;
  periods: TimePeriod[];
  now?: Date;
  minDate?: string;
  maxDate?: string;
}): TimeInterval[] {
  const { date, periods, now = new Date(), minDate, maxDate } = input;
  if ((minDate && date < minDate) || (maxDate && date > maxDate)) return [];

  return periods.flatMap((period) => {
    const start = dateAtSaoPaulo(date, period.startTime);
    const end = dateAtSaoPaulo(date, period.endTime);
    const slots: TimeInterval[] = [];
    for (let cursor = start.getTime(); cursor + SLOT_DURATION_MS <= end.getTime(); cursor += SLOT_DURATION_MS) {
      const slot = { startAt: new Date(cursor).toISOString(), endAt: new Date(cursor + SLOT_DURATION_MS).toISOString() };
      if (new Date(slot.startAt) > now) slots.push(slot);
    }
    return slots;
  });
}
