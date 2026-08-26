"use client";

import { useState, type ReactNode } from "react";
import { AdminBlockForm } from "@/components/admin-block-form";
import { AdminIncidents } from "@/components/admin-incidents";
import { AdminManagement } from "@/components/admin-management";
import { AdminSessionActions } from "@/components/admin-session-actions";
import { clinicDateFromInstant } from "@/domain/admin/week";

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

type AdminAgenda = {
  appointments: AgendaAppointment[];
  calendarEvents: DirectCalendarEvent[];
  calendarStatus: "ok" | "partial" | "unavailable" | "not_configured";
  blocks: AgendaBlock[];
};

type Props = {
  date: string;
  dateLabel: string;
  weekDates: string[];
  role: string;
  canManage: boolean;
  agenda: AdminAgenda;
  activity: {
    inbox: { id: string; phone: string; classified_intent: string | null; processed_action: string | null; status: string }[];
    outbox: { id: string; event_type: string; status: string; attempts: number }[];
  };
  professionals: { id: string; name: string }[];
  incidents: { id: string; category: string; status: string; summary: string; correlation_id: string | null; opened_at: string }[];
};

type MainTab = "Hoje" | "Semana" | "Pacientes" | "Mensagens" | "Gestão";

const navItems: { label: MainTab; hint: string; icon: ReactNode }[] = [
  { label: "Hoje", hint: "Visão do dia", icon: <><path d="M4 6.5h16M8 3v4M16 3v4" /><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 11h3v3H8zM13 11h3v3h-3zM8 16h3v2H8z" /></> },
  { label: "Semana", hint: "Agenda completa", icon: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M8 2v4M16 2v4M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2" /></> },
  { label: "Pacientes", hint: "Atendimentos de hoje", icon: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21c.7-4.3 3.2-6.5 7.5-6.5s6.8 2.2 7.5 6.5" /></> },
  { label: "Mensagens", hint: "WhatsApp e avisos", icon: <><path d="M5 18.5 3.5 22l4.4-1.5c1.2.6 2.6 1 4.1 1 5 0 9-3.8 9-8.5S17 4.5 12 4.5 3 8.3 3 13c0 2.1.7 4 2 5.5Z" /><path d="M8 11h8M8 15h5" /></> },
  { label: "Gestão", hint: "Cadastros e equipe", icon: <><path d="M12 3 4 7v5c0 4.8 2.8 8 8 9 5.2-1 8-4.2 8-9V7l-8-4Z" /><path d="M9 12l2 2 4-4" /></> },
];

const initials = (name: string) => name.split(" ").filter((part) => part.length > 2).slice(-2).map((part) => part[0]).join("").toUpperCase();
const appointmentTime = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" });
const dayFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });

function agendaForDate(agenda: AdminAgenda, date: string): AdminAgenda {
  return {
    appointments: agenda.appointments.filter((item) => clinicDateFromInstant(item.startAt) === date),
    calendarEvents: agenda.calendarEvents.filter((item) => clinicDateFromInstant(item.startAt) === date),
    blocks: agenda.blocks.filter((item) => item.date === date),
    calendarStatus: agenda.calendarStatus,
  };
}

function dateAtClinicNoon(date: string): Date { return new Date(`${date}T12:00:00-03:00`); }
function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }

function CalendarStatusWarning({ status }: { status: AdminAgenda["calendarStatus"] }) {
  if (status === "partial") return <p className="ops-calendar-warning" role="status">Parte dos eventos do Google Calendar não pôde ser carregada.</p>;
  if (status === "unavailable") return <p className="ops-calendar-warning" role="status">Google Calendar indisponível no momento. As consultas internas continuam visíveis.</p>;
  if (status === "not_configured") return <p className="ops-calendar-warning" role="status">Google Calendar ainda não está configurado.</p>;
  return null;
}

function AgendaTimeline({ agenda, emptyMessage }: { agenda: AdminAgenda; emptyMessage: string }) {
  const timeline = [
    ...agenda.appointments.map((item) => ({ ...item, kind: "appointment" as const })),
    ...agenda.calendarEvents.map((item) => ({ ...item, kind: "calendar" as const })),
  ].sort((left, right) => left.startAt.localeCompare(right.startAt));

  if (timeline.length === 0) return <p className="ops-week-empty">{emptyMessage}</p>;

  return <div className="ops-timeline">{timeline.map((item) => item.kind === "appointment" ? (
    <article className="ops-appointment" key={item.id}>
      <time dateTime={item.startAt}>{appointmentTime.format(new Date(item.startAt))}</time>
      <div><b>{item.agendaLabel}</b><span>{item.professionalName} · origem {item.source}</span><em>{item.status}</em></div>
    </article>
  ) : (
    <article className="ops-appointment ops-calendar-event" key={item.id}>
      <time dateTime={item.startAt}>{item.allDay ? "Dia todo" : appointmentTime.format(new Date(item.startAt))}</time>
      <div><b>{item.title}</b><span>{item.professionalName} · Google Calendar</span><em>direto na agenda</em></div>
    </article>
  ))}</div>;
}

function PageHeader({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children?: ReactNode }) {
  return <header className="ops-page-header">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="ops-subtitle">{subtitle}</p></div>
    {children && <div className="ops-page-actions">{children}</div>}
  </header>;
}

export function AdminConsole({ date, dateLabel, weekDates, role, canManage, agenda, activity, professionals, incidents }: Props) {
  const [tab, setTab] = useState<MainTab>("Hoje");
  const [expandedWeekDays, setExpandedWeekDays] = useState<Set<string>>(() => new Set([date]));
  const todayAgenda = agendaForDate(agenda, date);
  const weekStart = dateAtClinicNoon(weekDates[0]);
  const weekEnd = dateAtClinicNoon(weekDates.at(-1) ?? weekDates[0]);
  const openIncidents = incidents.filter((item) => item.status === "open").length;

  const navigation = navItems.map((item) => <button type="button" className={tab === item.label ? "active" : ""} aria-current={tab === item.label ? "page" : undefined} onClick={() => setTab(item.label)} key={item.label}>
    <svg viewBox="0 0 24 24" aria-hidden="true">{item.icon}</svg><span><b>{item.label}</b><small>{item.hint}</small></span>
  </button>);

  return (
    <main className="portal-shell admin-shell admin-workspace">
      <a className="skip-link" href="#ops-main-content">Ir para o conteúdo</a>
      <aside className="ops-sidebar">
        <div className="ops-brand"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 3c0 0 2 2 4 2s4-2 4-2c0 4-1 7-4 10-3-3-4-6-4-10z" /><path d="M9 15v4M15 15v4" /><path d="M8 3v2c0 2 .5 3 1.5 4M16 3v2c0 2-.5 3-1.5 4" /></svg></span><span><b>Luna</b><small>Clínica odontológica</small></span></div>
        <div className="ops-user"><span aria-hidden="true">{role.charAt(0)}</span><div><b>{role}</b><small>Acesso interno</small></div></div>
        <nav className="ops-side-nav" aria-label="Navegação principal">{navigation}</nav>
        <div className="ops-sidebar-footer"><span>Sessão protegida</span><AdminSessionActions /></div>
      </aside>

      <section className="ops-main">
        <header className="ops-mobile-header"><div className="ops-brand"><span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 3c0 0 2 2 4 2s4-2 4-2c0 4-1 7-4 10-3-3-4-6-4-10z" /><path d="M9 15v4M15 15v4" /><path d="M8 3v2c0 2 .5 3 1.5 4M16 3v2c0 2-.5 3-1.5 4" /></svg></span><span><b>Luna</b><small>Ops</small></span></div><AdminSessionActions /></header>
        <div className="ops-content" id="ops-main-content" tabIndex={-1}>
          {tab === "Hoje" && <>
            <PageHeader eyebrow={`Área interna · ${role}`} title="Visão de hoje" subtitle={dateLabel} />
            <div className="ops-stats" aria-label="Resumo do dia">
              <b>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                {todayAgenda.appointments.length}<small>consultas marcadas</small>
              </b>
              <b>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
                {todayAgenda.calendarEvents.length}<small>eventos no Google</small>
              </b>
              <b className="amber">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3L2.5 20h19L12 3z" /><path d="M12 10v4M12 17v1" /></svg>
                {openIncidents}<small>incidentes abertos</small>
              </b>
            </div>
            <CalendarStatusWarning status={agenda.calendarStatus} />
            <div className="ops-dashboard-grid">
              <section className="ops-card ops-today-timeline"><header className="ops-section-heading"><div><p className="eyebrow">Agenda</p><h2>Linha do tempo</h2></div><span>{todayAgenda.appointments.length + todayAgenda.calendarEvents.length} itens</span></header><AgendaTimeline agenda={todayAgenda} emptyMessage="Nenhum item agendado." />{todayAgenda.blocks.map((item) => <p className="ops-block" key={item.id}>Bloqueio · {item.professionalName} · {item.status}</p>)}</section>
              <aside className="ops-card ops-quick-action"><div className="ops-section-heading"><div><p className="eyebrow">Ação rápida</p><h2>Bloquear agenda</h2></div></div><p className="ops-card-intro">Registre uma indisponibilidade sem sair da visão do dia.</p><AdminBlockForm date={date} professionals={professionals} /></aside>
            </div>
          </>}

          {tab === "Semana" && <>
            <PageHeader eyebrow="Planejamento" title="Agenda da semana" subtitle={`${dayFormatter.format(weekStart)} — ${dayFormatter.format(weekEnd)}`} />
            <CalendarStatusWarning status={agenda.calendarStatus} />
            <div className="ops-week">
              {weekDates.map((weekDate) => {
                const dayAgenda = agendaForDate(agenda, weekDate);
                const dayDate = dateAtClinicNoon(weekDate);
                const count = dayAgenda.appointments.length + dayAgenda.calendarEvents.length + dayAgenda.blocks.length;
                return <details className={`ops-card ops-week-day ${weekDate === date ? "today" : ""}`} open={expandedWeekDays.has(weekDate)} onToggle={(event) => {
                  const open = event.currentTarget.open;
                  setExpandedWeekDays((current) => {
                    if (current.has(weekDate) === open) return current;
                    const next = new Set(current);
                    if (open) next.add(weekDate); else next.delete(weekDate);
                    return next;
                  });
                }} key={weekDate}>
                  <summary className="ops-week-day-header">
                    <span className="ops-week-day-title"><small>{weekDate === date ? "Hoje" : "Dia da semana"}</small><strong>{capitalize(weekdayFormatter.format(dayDate))}</strong><time dateTime={weekDate}>{dayFormatter.format(dayDate)}</time></span>
                    <span className="ops-week-day-meta"><b>{count} {count === 1 ? "item" : "itens"}</b><i aria-hidden="true" /></span>
                  </summary>
                  <div className="ops-week-day-content"><AgendaTimeline agenda={dayAgenda} emptyMessage="Nenhum atendimento." />
                    {dayAgenda.blocks.map((item) => <p className="ops-block" key={item.id}>Dia todo · Bloqueio · {item.professionalName} · {item.status}</p>)}
                  </div>
                </details>;
              })}
            </div>
          </>}

          {tab === "Pacientes" && <>
            <PageHeader eyebrow="Atendimento" title="Pacientes de hoje" subtitle={`${todayAgenda.appointments.length} ${todayAgenda.appointments.length === 1 ? "paciente agendado" : "pacientes agendados"}`} />
            {todayAgenda.appointments.length === 0 ? <section className="ops-empty-state"><div className="empty-illustration" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4.5 21c.7-4.3 3.2-6.5 7.5-6.5s6.8 2.2 7.5 6.5" /></svg></div><h2>Nenhum paciente aguardado</h2><p>A agenda de hoje não possui consultas marcadas.</p></section> : <div className="ops-list ops-patient-grid">{todayAgenda.appointments.map((item) => <article className="ops-card ops-patient-card" key={item.id}><span className="ops-avatar" aria-hidden="true">{initials(item.patientName)}</span><div><b>{item.patientName}</b><p>{appointmentTime.format(new Date(item.startAt))} · {item.professionalName}</p><small>{item.maskedPhone}</small></div><button type="button" className="text-button">Enviar lembrete</button></article>)}</div>}
          </>}

          {tab === "Mensagens" && <>
            <PageHeader eyebrow="Comunicação" title="Mensagens" subtitle="WhatsApp e notificações automáticas" />
            <div className="ops-message-columns">
              <section><header className="ops-column-title"><div><p className="eyebrow">Entrada</p><h2>Recebidas</h2></div><span>{activity.inbox.length}</span></header><div className="ops-list">{activity.inbox.length === 0 ? <section className="ops-empty-state"><div className="empty-illustration" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 18.5 3.5 22l4.4-1.5c1.2.6 2.6 1 4.1 1 5 0 9-3.8 9-8.5S17 4.5 12 4.5 3 8.3 3 13c0 2.1.7 4 2 5.5Z" /><path d="M8 11h8M8 15h5" /></svg></div><h2>Nenhuma mensagem recebida</h2><p>As mensagens do WhatsApp aparecerão aqui.</p></section> : activity.inbox.map((item) => <article className="ops-card" key={`i-${item.id}`}><b>{item.phone}</b><p>{item.classified_intent ?? "Mensagem recebida"}</p><small>{item.processed_action ?? item.status}</small></article>)}</div></section>
              <section><header className="ops-column-title"><div><p className="eyebrow">Saída</p><h2>Notificações</h2></div><span>{activity.outbox.length}</span></header><div className="ops-list">{activity.outbox.length === 0 ? <section className="ops-empty-state"><div className="empty-illustration" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></div><h2>Nenhuma notificação recente</h2><p>Os envios automáticos aparecerão aqui.</p></section> : activity.outbox.map((item) => <article className="ops-card" key={`o-${item.id}`}><b>{item.event_type}</b><p>{item.status}{item.attempts ? ` · ${item.attempts} tentativa(s)` : ""}</p></article>)}</div></section>
            </div>
          </>}

          {tab === "Gestão" && <>
            <PageHeader eyebrow="Configurações" title="Gestão da clínica" subtitle="Cadastros, conteúdo, equipe e rastreabilidade" />
            <AdminManagement canManage={canManage} />
            <details className="management-incidents"><summary>Incidentes operacionais <span>{openIncidents} abertos</span></summary><AdminIncidents incidents={incidents} /></details>
          </>}
        </div>
        <nav className="ops-nav" aria-label="Navegação principal">{navigation}</nav>
      </section>
    </main>
  );
}
