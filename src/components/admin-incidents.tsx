"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Incident = { id: string; category: string; status: string; summary: string; correlation_id: string | null; opened_at: string };
const categoryOptions: { value: string; label: string; description: string }[] = [
  { value: "validation", label: "Validação", description: "Dados do paciente ou do agendamento" },
  { value: "google_calendar", label: "Google Agenda", description: "Agenda do profissional" },
  { value: "supabase", label: "Banco de dados", description: "Persistência e autenticação interna" },
  { value: "evolution", label: "WhatsApp", description: "Envio ou recebimento de mensagens" },
  { value: "worker", label: "Worker", description: "Fila assíncrona e lembretes" },
  { value: "unknown", label: "Outra", description: "Sem categoria clara ainda" },
];

export function AdminIncidents({ incidents }: { incidents: Incident[] }) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingResolve, setPendingResolve] = useState<Incident | null>(null);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.get("category"),
          summary: form.get("summary"),
          correlationId: form.get("correlationId") || undefined,
        }),
      });
      if (!response.ok) { setNotice("Não foi possível registrar o incidente."); return; }
      event.currentTarget.reset();
      router.refresh();
    } finally { setSaving(false); }
  }

  async function resolve(id: string) {
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(`/api/admin/incidents/${id}/resolve`, { method: "POST" });
      if (!response.ok) { setNotice("Não foi possível encerrar o incidente."); return; }
      router.refresh();
    } finally { setSaving(false); }
  }

  return (
    <section className="card">
      <h2>Incidentes</h2>
      <form className="incident-form" onSubmit={create}>
        <label htmlFor="incident-category">Origem</label>
        <select id="incident-category" name="category" defaultValue="unknown">
          {categoryOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <p className="ops-form-help">A categoria ajuda a triagem. Se não tiver certeza, deixe em "Outra".</p>
        <label htmlFor="incident-summary">Resumo</label>
        <input id="incident-summary" name="summary" required minLength={1} maxLength={500} />
        <label htmlFor="incident-correlation">Correlation ID (opcional)</label>
        <input id="incident-correlation" name="correlationId" minLength={8} maxLength={80} />
        <button className="button" disabled={saving}>{saving ? "Salvando…" : "Registrar incidente"}</button>
      </form>
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="activity-list">
        {incidents.length === 0 && <p>Nenhum incidente registrado.</p>}
        {incidents.map((incident) => {
          const categoryLabel = categoryOptions.find((option) => option.value === incident.category)?.label ?? incident.category;
          return (
            <article key={incident.id}>
              <p><strong>{categoryLabel}</strong> · {incident.status}</p>
              <p>{incident.summary}</p>
              {incident.correlation_id && <p>ID: {incident.correlation_id}</p>}
              {incident.status === "open" && (
                <button className="text-button" disabled={saving} onClick={() => setPendingResolve(incident)}>
                  Encerrar
                </button>
              )}
            </article>
          );
        })}
      </div>
      {pendingResolve && (
        <div className="ops-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="incident-resolve-title" onKeyDown={(event) => { if (event.key === "Escape") setPendingResolve(null); }}>
          <div className="ops-inline-confirm">
            <p>
              <b id="incident-resolve-title">Encerrar este incidente?</b>
              <span>{pendingResolve.summary}{pendingResolve.correlation_id ? ` · ID ${pendingResolve.correlation_id}` : ""}</span>
            </p>
            <div>
              <button type="button" className="text-button" onClick={() => setPendingResolve(null)}>Cancelar</button>
              <button type="button" className="button" onClick={() => { void resolve(pendingResolve.id); setPendingResolve(null); }} autoFocus>Encerrar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
