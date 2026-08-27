"use client";

import { useState } from "react";

import { Badge } from "../badge";
import { Card } from "../card";
import { EmptyState } from "../empty-state";
import { PageHeader } from "../page-header";
import { Stat } from "../stat";
import type { AdminAgenda, MainTab } from "./types";
import { agendaForDate } from "./agenda-timeline";

const appointmentTime = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

type Props = {
  date: string;
  agenda: AdminAgenda;
};

export function PacientesTab({ date, agenda }: Props) {
  const today = agendaForDate(agenda, date);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  async function remind(appointmentId: string, patientName: string) {
    setNotice(null);
    try {
      const response = await fetch("/api/admin/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "evolution",
          summary: `Lembrete manual solicitado para ${patientName}`,
          correlationId: crypto.randomUUID(),
        }),
      });
      if (!response.ok) {
        setNotice("Não foi possível registrar o lembrete.");
        return;
      }
      setRequested((current) => new Set(current).add(appointmentId));
      setNotice("Lembrete registrado como incidente operacional; a equipe acompanha.");
    } catch {
      setNotice("Falha de rede ao registrar o lembrete.");
    }
  }

  return (
    <div data-tab={"Pacientes" satisfies MainTab}>
      <PageHeader eyebrow="Atendimento" title="Pacientes de hoje" subtitle={`${today.appointments.length} ${today.appointments.length === 1 ? "paciente agendado" : "pacientes agendados"}`} />
      <Stat tone="accent" value={today.appointments.length} label="pacientes a atender" />
      {notice && <p className="notice success" role="status">{notice}</p>}
      {today.appointments.length === 0 ? (
        <EmptyState title="Nenhum paciente aguardado" description="A agenda de hoje não possui consultas marcadas." />
      ) : (
        <div className="ops-list ops-patient-grid">
          {today.appointments.map((item) => {
            const isRequested = requested.has(item.id);
            return (
              <Card padding="default" className="ops-patient-card" key={item.id}>
                <span className="ops-avatar" aria-hidden="true">{initials(item.patientName)}</span>
                <div>
                  <b>{item.patientName}</b>
                  <p>{appointmentTime.format(new Date(item.startAt))} · {item.professionalName}</p>
                  <small>{item.maskedPhone}</small>
                  <Badge>{item.status}</Badge>
                </div>
                <button type="button" className="text-button" onClick={() => void remind(item.id, item.patientName)} disabled={isRequested}>
                  {isRequested ? "Lembrete solicitado" : "Enviar lembrete"}
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name.split(" ").filter((part) => part.length > 2).slice(-2).map((part) => part[0]).join("").toUpperCase();
}
