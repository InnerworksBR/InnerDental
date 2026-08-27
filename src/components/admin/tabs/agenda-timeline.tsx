import type { AdminAgenda } from "./types";
import { Badge } from "../badge";

type AgendaAppointment = {
  id: string;
  startAt: string;
  professionalName: string;
  patientName: string;
  agendaLabel: string;
  maskedPhone: string;
  status: string;
  source: string;
};

type DirectCalendarEvent = {
  id: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  title: string;
  professionalName: string;
  source: "google_calendar";
};

type AgendaBlock = { id: string; date: string; professionalName: string; status: string };

export type AdminAgendaView = {
  appointments: AgendaAppointment[];
  calendarEvents: DirectCalendarEvent[];
  calendarStatus: "ok" | "partial" | "unavailable" | "not_configured";
  blocks: AgendaBlock[];
};

const appointmentTime = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export function AgendaTimeline({ agenda, emptyMessage }: { agenda: AdminAgendaView; emptyMessage: string }) {
  const timeline = [
    ...agenda.appointments.map((item) => ({ ...item, kind: "appointment" as const })),
    ...agenda.calendarEvents.map((item) => ({ ...item, kind: "calendar" as const })),
  ].sort((left, right) => left.startAt.localeCompare(right.startAt));

  if (timeline.length === 0) return <p className="ops-week-empty">{emptyMessage}</p>;

  return (
    <div className="ops-timeline">
      {timeline.map((item) =>
        item.kind === "appointment" ? (
          <article className="ops-appointment" key={item.id}>
            <time dateTime={item.startAt}>{appointmentTime.format(new Date(item.startAt))}</time>
            <div>
              <b>{item.agendaLabel}</b>
              <span>{item.professionalName} · origem {item.source}</span>
              <Badge>{item.status}</Badge>
            </div>
          </article>
        ) : (
          <article className="ops-appointment ops-calendar-event" key={item.id}>
            <time dateTime={item.startAt}>{item.allDay ? "Dia todo" : appointmentTime.format(new Date(item.startAt))}</time>
            <div>
              <b>{item.title}</b>
              <span>{item.professionalName} · Google Calendar</span>
              <Badge tone="muted">direto na agenda</Badge>
            </div>
          </article>
        )
      )}
    </div>
  );
}

export function agendaForDate(agenda: AdminAgenda, date: string): AdminAgendaView {
  return {
    appointments: agenda.appointments.filter((item) => item.startAt.startsWith(date) || item.startAt.slice(0, 10) === date),
    calendarEvents: agenda.calendarEvents.filter((item) => item.startAt.startsWith(date) || item.startAt.slice(0, 10) === date),
    blocks: agenda.blocks.filter((item) => item.date === date),
    calendarStatus: agenda.calendarStatus,
  };
}

export function CalendarStatusWarning({ status }: { status: AdminAgenda["calendarStatus"] }) {
  if (status === "partial") return <p className="ops-calendar-warning" role="status">Parte dos eventos do Google Calendar não pôde ser carregada.</p>;
  if (status === "unavailable") return <p className="ops-calendar-warning" role="status">Google Calendar indisponível no momento. As consultas internas continuam visíveis.</p>;
  if (status === "not_configured") return <p className="ops-calendar-warning" role="status">Google Calendar ainda não está configurado.</p>;
  return null;
}
