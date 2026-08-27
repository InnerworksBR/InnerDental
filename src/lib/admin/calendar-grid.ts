import { addDays, addMonths, startOfMonth, startOfWeek } from "date-fns";

import { clinicDateFromInstant } from "@/domain/admin/week";
import type { AdminAgenda } from "@/components/admin/tabs/types";

const CLINIC_TZ_OFFSET_MIN = -180;

function clinicDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

export function shiftClinicDate(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00-03:00`);
  base.setUTCDate(base.getUTCDate() + days);
  return clinicDate(base);
}

export function weekGridDates(date: string): string[] {
  const start = startOfWeek(new Date(`${date}T12:00:00-03:00`), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => clinicDate(addDays(start, i)));
}

export function monthGridDates(date: string): string[] {
  const monthAnchor = startOfMonth(new Date(`${date}T12:00:00-03:00`));
  const gridStart = startOfWeek(monthAnchor, { weekStartsOn: 1 });
  return Array.from({ length: 42 }, (_, i) => clinicDate(addDays(gridStart, i)));
}

export function monthLabel(date: string): string {
  const formatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  const raw = formatter.format(new Date(`${date}T12:00:00-03:00`));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function weekdayLabels(): string[] {
  const formatter = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" });
  const ref = new Date("2024-01-01T12:00:00-03:00");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ref);
    d.setUTCDate(d.getUTCDate() + i);
    return formatter.format(d).replace(".", "").toUpperCase();
  });
}

export function dateBelongsToMonth(d: string, anchor: string): boolean {
  const a = startOfMonth(new Date(`${anchor}T12:00:00-03:00`));
  const b = startOfMonth(new Date(`${d}T12:00:00-03:00`));
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

export function isAllDay(event: { allDay?: boolean; startAt: string; endAt: string }): boolean {
  if (event.allDay) return true;
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  return end.getTime() - start.getTime() >= 24 * 60 * 60 * 1000;
}

export type CalendarItem =
  | { kind: "appointment"; id: string; startAt: string; endAt: string; label: string; professionalName: string; status: string; source: string }
  | { kind: "calendar"; id: string; startAt: string; endAt: string; title: string; professionalName: string }
  | { kind: "block"; id: string; startAt: string; endAt: string; professionalName: string; status: string };

export function bucketAgendaByDay(agenda: AdminAgenda, dates: string[]): Record<string, CalendarItem[]> {
  const buckets: Record<string, CalendarItem[]> = Object.fromEntries(dates.map((d) => [d, []]));
  for (const appt of agenda.appointments) {
    const d = clinicDateFromInstant(appt.startAt);
    if (!buckets[d]) continue;
    buckets[d].push({
      kind: "appointment",
      id: appt.id,
      startAt: appt.startAt,
      endAt: (appt as { endAt?: string }).endAt ?? new Date(new Date(appt.startAt).getTime() + 15 * 60_000).toISOString(),
      label: appt.agendaLabel,
      professionalName: appt.professionalName,
      status: appt.status,
      source: appt.source,
    });
  }
  for (const ev of agenda.calendarEvents) {
    const d = clinicDateFromInstant(ev.startAt);
    if (!buckets[d]) continue;
    buckets[d].push({
      kind: "calendar",
      id: ev.id,
      startAt: ev.startAt,
      endAt: ev.endAt,
      title: ev.title,
      professionalName: ev.professionalName,
    });
  }
  for (const block of agenda.blocks) {
    if (!buckets[block.date]) continue;
    const start = `${block.date}T08:00:00-03:00`;
    const end = `${block.date}T18:00:00-03:00`;
    buckets[block.date].push({
      kind: "block",
      id: block.id,
      startAt: start,
      endAt: end,
      professionalName: block.professionalName,
      status: block.status,
    });
  }
  for (const d of dates) {
    buckets[d].sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
  return buckets;
}

export function nextMonthAnchor(date: string): string {
  const base = new Date(`${date}T12:00:00-03:00`);
  return clinicDate(addMonths(base, 1));
}

export function prevMonthAnchor(date: string): string {
  const base = new Date(`${date}T12:00:00-03:00`);
  return clinicDate(addMonths(base, -1));
}

export function nextWeekAnchor(date: string): string {
  return shiftClinicDate(date, 7);
}

export function prevWeekAnchor(date: string): string {
  return shiftClinicDate(date, -7);
}

export function nextDayAnchor(date: string): string {
  return shiftClinicDate(date, 1);
}

export function prevDayAnchor(date: string): string {
  return shiftClinicDate(date, -1);
}

export function topPxFor(startAt: string, hourHeight: number, minStart = 7, maxEnd = 21): number {
  const d = new Date(startAt);
  const clinicHour = d.getUTCHours() - CLINIC_TZ_OFFSET_MIN / 60;
  const minute = d.getUTCMinutes();
  const clampedHour = Math.max(minStart, Math.min(maxEnd - 0.5, clinicHour + minute / 60));
  return Math.round((clampedHour - minStart) * hourHeight);
}

export function hourHeightFor(view: "day" | "week"): number {
  return view === "day" ? 56 : 32;
}
