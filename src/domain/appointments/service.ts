import type { TimeInterval } from "@/domain/availability/slots";

export const CANCEL_NOTICE_MS = 24 * 60 * 60 * 1000;
export class AppointmentPolicyError extends Error {}

export function ensureFutureCancellation(startAt: string, now = new Date()): void {
  if (new Date(startAt).getTime() - now.getTime() < CANCEL_NOTICE_MS) throw new AppointmentPolicyError("CANCEL_NOTICE_REQUIRED");
}

export function calendarEventPayload(input: { appointmentId: string; patientName: string; companionName?: string; phone: string; interval: TimeInterval }) {
  const names = input.companionName?.trim() ? `${input.patientName} e ${input.companionName.trim()}` : input.patientName;
  return {
    summary: `${names} ${input.phone}`,
    description: `Luna Agenda\nID interno: ${input.appointmentId}`,
    start: { dateTime: input.interval.startAt, timeZone: "America/Sao_Paulo" },
    end: { dateTime: input.interval.endAt, timeZone: "America/Sao_Paulo" },
  };
}

export function allDayBlockEventPayload(input: { blockId: string; date: string; professionalName: string }) {
  const start = new Date(`${input.date}T12:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  return {
    summary: `Bloqueio administrativo | ${input.professionalName}`,
    description: `Luna Agenda\nBloqueio integral\nID interno: ${input.blockId}`,
    start: { date: input.date },
    end: { date: start.toISOString().slice(0, 10) },
  };
}
