import { bucketAgendaByDay, weekdayLabels } from "@/lib/admin/calendar-grid";
import type { AdminAgenda, CalendarView } from "../tabs/types";
import { AgendaTimeline, agendaForDate } from "../tabs/agenda-timeline";
import { EmptyState } from "../empty-state";

type Props = {
  date: string;
  view: CalendarView;
  agenda: AdminAgenda;
};

export function CalendarDayView({ date, agenda }: Props) {
  const today = agendaForDate(agenda, date);
  return (
    <section className="ops-card">
      {today.appointments.length + today.calendarEvents.length === 0 ? (
        <EmptyState title="Nada agendado neste dia." description="A doutora não tem compromissos marcados para esta data." />
      ) : (
        <AgendaTimeline agenda={today} emptyMessage="Nada agendado." />
      )}
      {today.blocks.map((block) => (
        <p className="ops-block" key={block.id}>Bloqueio · {block.professionalName} · {block.status}</p>
      ))}
    </section>
  );
}

export function CalendarWeekView({ date, agenda }: { date: string; agenda: AdminAgenda }) {
  const start = new Date(`${date}T12:00:00-03:00`);
  const mondayOffset = (start.getUTCDay() + 6) % 7;
  const monday = new Date(start);
  monday.setUTCDate(monday.getUTCDate() - mondayOffset);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const buckets = bucketAgendaByDay(agenda, dates);
  const labels = weekdayLabels();
  return (
    <div className="ops-dashboard-grid">
      {dates.map((d, i) => (
        <section className="ops-card" key={d}>
          <header className="ops-section-heading">
            <div><p className="eyebrow">{labels[i]}</p><h2>{d === new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) ? "Hoje" : ""}</h2></div>
            <span>{buckets[d].length}</span>
          </header>
          <AgendaTimeline agenda={agendaForDate(agenda, d)} emptyMessage="Nenhum atendimento." />
        </section>
      ))}
    </div>
  );
}
