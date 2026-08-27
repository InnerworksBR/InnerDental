import type { CalendarView } from "../tabs/types";
import { nextDayAnchor, nextMonthAnchor, nextWeekAnchor, prevDayAnchor, prevMonthAnchor, prevWeekAnchor } from "@/lib/admin/calendar-grid";

type Props = {
  date: string;
  view: CalendarView;
  monthLabel?: string;
  weekLabel?: string;
  dayLabel?: string;
  onPrev: (next: string) => void;
  onNext: (next: string) => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
};

export function CalendarToolbar({ date, view, monthLabel, weekLabel, dayLabel, onPrev, onNext, onToday, onViewChange }: Props) {
  const prev = view === "month" ? prevMonthAnchor(date) : view === "week" ? prevWeekAnchor(date) : prevDayAnchor(date);
  const next = view === "month" ? nextMonthAnchor(date) : view === "week" ? nextWeekAnchor(date) : nextDayAnchor(date);
  const title = view === "month" ? monthLabel : view === "week" ? weekLabel : dayLabel;

  return (
    <div className="cal-toolbar">
      <div className="cal-toolbar__nav">
        <button type="button" onClick={() => onPrev(prev)} aria-label="Período anterior">‹</button>
        <button type="button" onClick={() => onNext(next)} aria-label="Próximo período">›</button>
        <button type="button" className="cal-toolbar__today" onClick={onToday}>Hoje</button>
      </div>
      <h2 className="cal-toolbar__title">{title}</h2>
      <div className="cal-toolbar__view" role="tablist" aria-label="Modo de visualização">
        <button type="button" role="tab" aria-selected={view === "day"} className={view === "day" ? "active" : ""} onClick={() => onViewChange("day")}>Dia</button>
        <button type="button" role="tab" aria-selected={view === "week"} className={view === "week" ? "active" : ""} onClick={() => onViewChange("week")}>Semana</button>
        <button type="button" role="tab" aria-selected={view === "month"} className={view === "month" ? "active" : ""} onClick={() => onViewChange("month")}>Mês</button>
      </div>
    </div>
  );
}
