"use client";

import { useMemo, useState } from "react";

import { Badge } from "../badge";
import { Card } from "../card";
import { EmptyState } from "../empty-state";
import { PageHeader } from "../page-header";
import { SectionHeader } from "../section-header";
import { Stat } from "../stat";
import { AdminBlockForm } from "@/components/admin-block-form";
import { CalendarStatusWarning, agendaForDate } from "./agenda-timeline";
import { CalendarBoard } from "../calendar/board";
import { CalendarToolbar } from "../calendar/toolbar";
import { monthLabel, weekGridDates } from "@/lib/admin/calendar-grid";
import type { AdminAgenda, CalendarView, MainTab, Professional } from "./types";

const todayFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "America/Sao_Paulo" });

type Props = {
  date: string;
  view: CalendarView;
  agenda: AdminAgenda;
  professionals: Professional[];
  incidents: { id: string; category: string; status: string }[];
};

export function AgendaTab({ date, view, agenda, professionals, incidents }: Props) {
  const [currentView, setCurrentView] = useState<CalendarView>(view);
  const [currentDate, setCurrentDate] = useState(date);
  const [drawerItem, setDrawerItem] = useState<import("@/lib/admin/calendar-grid").CalendarItem | null>(null);

  const today = useMemo(() => agendaForDate(agenda, currentDate), [agenda, currentDate]);
  const openIncidents = incidents.filter((item) => item.status === "open").length;
  const weekDates = weekGridDates(currentDate);
  const weekStart = weekDates[0];
  const weekEnd = weekDates.at(-1) ?? weekDates[0];

  const handleNavigate = useCallback((next: string) => {
    setCurrentDate(next);
    setDrawerItem(null);
  }, []);

  const handleToday = useCallback(() => {
    const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    setCurrentDate(iso);
  }, []);

  const handleViewChange = useCallback((next: CalendarView) => {
    setCurrentView(next);
    setDrawerItem(null);
  }, []);

  const weekLabel = `Semana de ${weekStart.replace(/-/g, "/")} — ${weekEnd.replace(/-/g, "/")}`;
  const dayLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "America/Sao_Paulo" }).format(new Date(`${currentDate}T12:00:00-03:00`));

  return (
    <div data-tab={"Agenda" satisfies MainTab}>
      <PageHeader eyebrow="Planejamento" title="Agenda" subtitle={todayFormatter.format(new Date())} />
      <div className="ops-stats" aria-label="Resumo da agenda">
        <Stat tone="accent" value={today.appointments.length} label="consultas marcadas" />
        <Stat value={today.calendarEvents.length} label="eventos no Google" />
        <Stat tone="amber" value={openIncidents} label="incidentes abertos" />
      </div>
      <CalendarStatusWarning status={agenda.calendarStatus} />
      <CalendarToolbar
        date={currentDate}
        view={currentView}
        monthLabel={monthLabel(currentDate)}
        weekLabel={weekLabel}
        dayLabel={dayLabel}
        onPrev={handleNavigate}
        onNext={handleNavigate}
        onToday={handleToday}
        onViewChange={handleViewChange}
      />
      <CalendarBoard
        date={currentDate}
        view={currentView}
        agenda={agenda}
        calendarStatus={agenda.calendarStatus}
        onDayClick={handleNavigate}
        drawerItem={drawerItem}
        onCloseDrawer={() => setDrawerItem(null)}
      />
      {currentView === "day" && (
        <Card padding="spacious" style={{ marginTop: 18 }}>
          <SectionHeader eyebrow="Ação rápida" title="Bloquear agenda" />
          <p className="ops-card-intro">Registre uma indisponibilidade sem sair da visão do dia.</p>
          <AdminBlockForm date={currentDate} professionals={professionals} />
        </Card>
      )}
      {today.appointments.length === 0 && today.calendarEvents.length === 0 && (
        <EmptyState title="Dia livre" description="Nenhum compromisso previsto para esta data." />
      )}
      <div style={{ display: "none" }}>
        {/* preserve reference for typecheck */}
        {agenda.appointments.length}
        <Badge>{today.calendarStatus}</Badge>
      </div>
    </div>
  );
}

import { useCallback } from "react";
