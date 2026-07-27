import type { CalendarEvent } from "../../integrations/google-calendar/port.ts";
import { normalizeBrazilianPhone } from "../../lib/phone/normalize.ts";

export type DirectCalendarAppointment = {
  calendarEventId: string;
  patientName: string;
  phone: string;
  startAt: string;
  endAt: string;
};

const SUPPORTED_DURATIONS_MS = new Set([15 * 60_000, 30 * 60_000]);
const TRAILING_PHONE = /(\+?\(?\d[\d\s().-]{8,}\d)\s*$/;

export function parseDirectCalendarAppointment(event: CalendarEvent, now = new Date()): DirectCalendarAppointment | null {
  if (event.allDay || !event.blocksTime || !event.summary) return null;
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start <= now || !SUPPORTED_DURATIONS_MS.has(end.getTime() - start.getTime())) return null;

  const summary = event.summary.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  const phoneMatch = summary.match(TRAILING_PHONE);
  if (!phoneMatch || phoneMatch.index === undefined) return null;

  const patientName = summary.slice(0, phoneMatch.index).replace(/[|—–-]+\s*$/, "").trim();
  if (patientName.length < 2 || patientName.length > 160) return null;

  try {
    return {
      calendarEventId: event.id,
      patientName,
      phone: normalizeBrazilianPhone(phoneMatch[1]),
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    };
  } catch {
    return null;
  }
}
