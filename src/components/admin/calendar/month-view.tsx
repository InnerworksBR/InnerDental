import { bucketAgendaByDay, dateBelongsToMonth, monthGridDates, weekdayLabels } from "@/lib/admin/calendar-grid";
import type { AdminAgenda } from "../tabs/types";
import { EventPill } from "./event-pill";

type Props = {
  date: string;
  agenda: AdminAgenda;
  onDayClick: (date: string) => void;
};

const dayFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", timeZone: "America/Sao_Paulo" });

export function CalendarMonthView({ date, agenda, onDayClick }: Props) {
  const days = monthGridDates(date);
  const buckets = bucketAgendaByDay(agenda, days);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const labels = weekdayLabels();

  return (
    <div className="cal-month">
      <div className="cal-month__weekdays" aria-hidden="true">
        {labels.map((label, i) => <span key={i}>{label}</span>)}
      </div>
      <div className="cal-month__grid" role="grid">
        {days.map((d) => {
          const inMonth = dateBelongsToMonth(d, date);
          const isToday = d === today;
          const items = buckets[d] ?? [];
          const visible = items.slice(0, 3);
          const remaining = items.length - visible.length;
          return (
            <button
              type="button"
              key={d}
              className={[
                "cal-month__cell",
                inMonth ? "" : "cal-month__cell--out",
                isToday ? "cal-month__cell--today" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => onDayClick(d)}
              aria-label={`${d}, ${items.length} ${items.length === 1 ? "item" : "itens"}`}
            >
              <span className="cal-month__day">{dayFormatter.format(new Date(`${d}T12:00:00-03:00`))}</span>
              <div className="cal-month__events">
                {visible.map((item) => <EventPill key={item.id} item={item} compact />)}
                {remaining > 0 && <span className="cal-month__more">+{remaining}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
