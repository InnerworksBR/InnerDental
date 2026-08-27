"use client";

import { useState } from "react";

import { Badge } from "../badge";
import { EmptyState } from "../empty-state";
import { PageHeader } from "../page-header";
import { SectionHeader } from "../section-header";
import { Stat } from "../stat";
import { CalendarStatusWarning, agendaForDate } from "./agenda-timeline";
import type { AdminAgenda, Incident, MainTab } from "./types";

const appointmentTime = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const todayLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "America/Sao_Paulo" });

type Props = {
  date: string;
  dateLabel: string;
  agenda: AdminAgenda;
  professionals: { id: string; name: string }[];
  incidents: Incident[];
};

export function HojeTab({ date, dateLabel, agenda, professionals, incidents }: Props) {
  const today = agendaForDate(agenda, date);
  const openIncidents = incidents.filter((item) => item.status === "open").length;

  return (
    <div data-tab={"Hoje" satisfies MainTab}>
      <PageHeader eyebrow="Área interna" title="Visão de hoje" subtitle={dateLabel || todayLabel.format(new Date())} />
      <div className="ops-stats" aria-label="Resumo do dia">
        <Stat tone="accent" value={today.appointments.length} label="consultas marcadas" />
        <Stat value={today.calendarEvents.length} label="eventos no Google" />
        <Stat tone="amber" value={openIncidents} label="incidentes abertos" />
      </div>
      <CalendarStatusWarning status={agenda.calendarStatus} />
      <div className="ops-dashboard-grid">
        <section className="ops-card">
          <SectionHeader eyebrow="Agenda" title="Linha do tempo" meta={`${today.appointments.length + today.calendarEvents.length} itens`} />
          {today.appointments.length + today.calendarEvents.length === 0 ? (
            <EmptyState title="Dia livre" description="Nenhum compromisso previsto para esta data." />
          ) : (
            <Timeline agenda={today} />
          )}
          {today.blocks.map((block) => (
            <p className="ops-block" key={block.id}>Bloqueio · {block.professionalName} · {block.status}</p>
          ))}
        </section>
        <aside className="ops-card">
          <SectionHeader eyebrow="Ação rápida" title="Bloquear agenda" />
          <p className="ops-card-intro">Registre uma indisponibilidade sem sair da visão do dia.</p>
          <BlockFormInline date={date} professionals={professionals} />
        </aside>
      </div>
    </div>
  );
}

function Timeline({ agenda }: { agenda: ReturnType<typeof agendaForDate> }) {
  const timeline = [
    ...agenda.appointments.map((item) => ({ ...item, kind: "appointment" as const })),
    ...agenda.calendarEvents.map((item) => ({ ...item, kind: "calendar" as const })),
  ].sort((left, right) => left.startAt.localeCompare(right.startAt));
  return (
    <div className="ops-timeline">
      {timeline.map((item) => item.kind === "appointment" ? (
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
      ))}
    </div>
  );
}

// Inline block form to avoid extra roundtrip
import { AdminBlockForm } from "@/components/admin-block-form";
function BlockFormInline(props: { date: string; professionals: { id: string; name: string }[] }) {
  const [mounted, setMounted] = useState(false);
  if (!mounted) return <button type="button" className="button" onClick={() => setMounted(true)}>Bloquear um dia</button>;
  return <AdminBlockForm {...props} />;
}
