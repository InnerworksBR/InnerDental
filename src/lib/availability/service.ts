import "server-only";

import { CalendarUnavailableError, calculateAvailability } from "@/domain/availability/service";
import { isBusinessDate, minimumBookingDate } from "@/domain/availability/business-days";
import { intervalForSlots, slotFor, withConsecutiveSlots, type AppointmentSlotCount, type TimeInterval } from "@/domain/availability/slots";
import { GoogleCalendarHttpGateway } from "@/integrations/google-calendar/http-gateway";
import { getProfessionalCalendar, getRulesAndExceptionsForDates } from "@/lib/availability/repository";

const MAX_DATE_OFFSET = 60;

function utcDateAtSaoPaulo(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (kind: "year" | "month" | "day") => parts.find((part) => part.type === kind)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function plusDays(date: Date, days: number): string {
  const copy = new Date(date); copy.setUTCDate(copy.getUTCDate() + days); return utcDateAtSaoPaulo(copy);
}
function weekday(date: string): number { return new Date(`${date}T12:00:00-03:00`).getDay(); }

export type AvailabilityDay = { date: string; slots: TimeInterval[] };

export async function getAvailabilityWindow(professionalId: string, dates: string[], accessToken: string, now = new Date()): Promise<AvailabilityDay[]> {
  const minDate = minimumBookingDate(now);
  const maxDate = plusDays(now, MAX_DATE_OFFSET);
  const validDates = [...new Set(dates)]
    .filter((date) => isBusinessDate(date) && date >= minDate && date <= maxDate)
    .sort();
  if (validDates.length === 0) return [];

  const [calendarId, availability] = await Promise.all([
    getProfessionalCalendar(professionalId),
    getRulesAndExceptionsForDates(professionalId, validDates),
  ]);
  if (!calendarId) return [];

  const firstDate = validDates[0];
  const lastDate = validDates.at(-1) ?? firstDate;
  const range = {
    startAt: slotFor(firstDate, "00:00").startAt,
    endAt: slotFor(plusDays(new Date(`${lastDate}T12:00:00-03:00`), 1), "00:00").startAt,
  };
  const busyIntervals = await new GoogleCalendarHttpGateway(accessToken).listBusyIntervals(calendarId, range);

  return validDates.map((date) => ({
    date,
    slots: calculateAvailability({
      date,
      periods: availability.rules
        .filter((rule) => rule.weekday === weekday(date))
        .map((rule) => ({ startTime: rule.start_time, endTime: rule.end_time })),
      exceptions: availability.exceptions
        .filter((entry) => entry.date === date)
        .map((entry) => ({ type: entry.type, startTime: entry.start_time, endTime: entry.end_time })),
      busyIntervals,
      now,
      minDate,
      maxDate,
    }),
  }));
}

export async function getAvailability(professionalId: string, date: string, accessToken: string, now = new Date()): Promise<TimeInterval[]> {
  const [day] = await getAvailabilityWindow(professionalId, [date], accessToken, now);
  return day?.slots ?? [];
}

export async function verifySlotFresh(professionalId: string, date: string, time: string, accessToken: string): Promise<boolean> {
  return verifySlotSequenceFresh(professionalId, date, time, 1, accessToken);
}

export async function verifySlotSequenceFresh(professionalId: string, date: string, time: string, slotCount: AppointmentSlotCount, accessToken: string): Promise<boolean> {
  try {
    const target = intervalForSlots(date, time, slotCount);
    const available = await getAvailability(professionalId, date, accessToken);
    return withConsecutiveSlots(available, slotCount).some((slot) => slot.startAt === target.startAt);
  } catch (error) {
    if (error instanceof CalendarUnavailableError) return false;
    throw error;
  }
}
