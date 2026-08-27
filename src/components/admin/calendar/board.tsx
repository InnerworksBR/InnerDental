import type { AdminAgenda, CalendarView } from "../tabs/types";
import { CalendarDayView, CalendarWeekView } from "./day-week-view";
import { CalendarMonthView } from "./month-view";
import { EmptyState } from "../empty-state";
import { EventPill } from "./event-pill";
import { bucketAgendaByDay } from "@/lib/admin/calendar-grid";
import { Drawer } from "../drawer";

type Props = {
  date: string;
  view: CalendarView;
  agenda: AdminAgenda;
  calendarStatus: AdminAgenda["calendarStatus"];
  onDayClick: (date: string) => void;
  drawerItem: import("@/lib/admin/calendar-grid").CalendarItem | null;
  onCloseDrawer: () => void;
};

export function CalendarBoard({ date, view, agenda, calendarStatus, onDayClick, drawerItem, onCloseDrawer }: Props) {
  return (
    <>
      {view === "month" && (
        <CalendarMonthView date={date} agenda={agenda} onDayClick={onDayClick} />
      )}
      {view === "week" && <CalendarWeekView date={date} agenda={agenda} />}
      {view === "day" && <CalendarDayView date={date} view={view} agenda={agenda} />}
      {calendarStatus !== "ok" && (
        <EmptyState
          title={calendarStatus === "not_configured" ? "Google Calendar não configurado" : "Google Calendar indisponível"}
          description="As consultas internas continuam visíveis; eventos diretos do Calendar podem não aparecer."
        />
      )}
      <Drawer
        open={drawerItem !== null}
        onClose={onCloseDrawer}
        title={drawerItemTitle(drawerItem)}
      >
        {drawerItem && <DrawerBody item={drawerItem} />}
      </Drawer>
    </>
  );
}

function drawerItemTitle(item: import("@/lib/admin/calendar-grid").CalendarItem | null): string {
  if (!item) return "";
  if (item.kind === "appointment") return item.label;
  if (item.kind === "calendar") return item.title;
  return `Bloqueio · ${item.professionalName}`;
}

function DrawerBody({ item }: { item: import("@/lib/admin/calendar-grid").CalendarItem }) {
  const timeFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" });
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p><b>Profissional:</b> {item.professionalName}</p>
      <p><b>Início:</b> {timeFormatter.format(new Date(item.startAt))}</p>
      <p><b>Fim:</b> {timeFormatter.format(new Date(item.endAt))}</p>
      {item.kind === "appointment" && <p><b>Status:</b> {item.status}</p>}
      {item.kind === "appointment" && <p><b>Origem:</b> {item.source}</p>}
      {item.kind === "block" && <p><b>Status do bloqueio:</b> {item.status}</p>}
      <EventPill item={item} compact />
    </div>
  );
}

// Re-export for tests
export { bucketAgendaByDay };
