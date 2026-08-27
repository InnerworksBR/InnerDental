"use client";

import { useState, type ReactNode } from "react";

import { AdminSessionActions } from "@/components/admin-session-actions";
import type { AdminAgenda, CalendarView, Incident, MainTab, Professional } from "./admin/tabs/types";
import { AgendaTab } from "./admin/tabs/agenda-tab";
import { GestaoTab } from "./admin/tabs/gestao-tab";
import { HojeTab } from "./admin/tabs/hoje-tab";
import { MensagensTab } from "./admin/tabs/mensagens-tab";
import { PacientesTab } from "./admin/tabs/pacientes-tab";
import type { AggregatedAnalysis, AnalysisLog, AnalysisWindow } from "@/domain/conversation-analysis/service";

type Activity = {
  inbox: { id: string; phone: string; classified_intent: string | null; processed_action: string | null; status: string; created_at: string; last_error?: string | null }[];
  outbox: { id: string; event_type: string; status: string; attempts: number; created_at: string; sent_at?: string | null }[];
};

type Props = {
  date: string;
  dateLabel: string;
  weekDates: string[];
  view: CalendarView;
  role: string;
  canManage: boolean;
  agenda: AdminAgenda;
  activity: Activity;
  professionals: Professional[];
  incidents: Incident[];
  initialAnalysis: AggregatedAnalysis;
};

const navItems: { label: MainTab; hint: string; icon: ReactNode }[] = [
  { label: "Hoje", hint: "Visão do dia", icon: <><path d="M4 6.5h16M8 3v4M16 3v4" /><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 11h3v3H8zM13 11h3v3h-3zM8 16h3v2H8z" /></> },
  { label: "Agenda", hint: "Mês, semana ou dia", icon: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M8 2v4M16 2v4M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2" /></> },
  { label: "Pacientes", hint: "Atendimentos de hoje", icon: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21c.7-4.3 3.2-6.5 7.5-6.5s6.8 2.2 7.5 6.5" /></> },
  { label: "Mensagens", hint: "WhatsApp e análise IA", icon: <><path d="M5 18.5 3.5 22l4.4-1.5c1.2.6 2.6 1 4.1 1 5 0 9-3.8 9-8.5S17 4.5 12 4.5 3 8.3 3 13c0 2.1.7 4 2 5.5Z" /><path d="M8 11h8M8 15h5" /></> },
  { label: "Gestão", hint: "Cadastros e equipe", icon: <><path d="M12 3 4 7v5c0 4.8 2.8 8 8 9 5.2-1 8-4.2 8-9V7l-8-4Z" /><path d="M9 12l2 2 4-4" /></> },
];

export function AdminConsole({ date, dateLabel, weekDates, view, role, canManage, agenda, activity, professionals, incidents, initialAnalysis }: Props) {
  const [tab, setTab] = useState<MainTab>("Hoje");
  const _weekDates = weekDates;

  const navigation = navItems.map((item) => (
    <button type="button" className={tab === item.label ? "active" : ""} aria-current={tab === item.label ? "page" : undefined} onClick={() => setTab(item.label)} key={item.label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{item.icon}</svg>
      <span><b>{item.label}</b><small>{item.hint}</small></span>
    </button>
  ));

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
          {tab === "Hoje" && <HojeTab date={date} dateLabel={dateLabel} agenda={agenda} professionals={professionals} incidents={incidents} />}
          {tab === "Agenda" && <AgendaTab date={date} view={view} agenda={agenda} professionals={professionals} incidents={incidents} />}
          {tab === "Pacientes" && <PacientesTab date={date} agenda={agenda} />}
          {tab === "Mensagens" && <MensagensTab initialInbox={activity.inbox} initialOutbox={activity.outbox} initialIncidents={incidents} initialAnalysis={initialAnalysis} />}
          {tab === "Gestão" && <GestaoTab canManage={canManage} incidents={incidents} />}
        </div>
        <nav className="ops-nav" aria-label="Navegação principal">{navigation}</nav>
      </section>
    </main>
  );
}

export type { AdminAgenda, Incident, Professional, CalendarView, MainTab, AnalysisWindow, AnalysisLog, AggregatedAnalysis };
