"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "./admin/badge";
import { Card } from "./admin/card";

type Incident = { id: string; category: string; status: string; summary: string; correlation_id: string | null; opened_at: string };
const categoryOptions: { value: string; label: string; description: string }[] = [
  { value: "validation", label: "Validação", description: "Dados do paciente ou do agendamento" },
  { value: "google_calendar", label: "Google Agenda", description: "Agenda do profissional" },
  { value: "supabase", label: "Banco de dados", description: "Persistência e autenticação interna" },
  { value: "evolution", label: "WhatsApp", description: "Envio ou recebimento de mensagens" },
  { value: "worker", label: "Worker", description: "Fila assíncrona e lembretes" },
  { value: "unknown", label: "Outra", description: "Sem categoria clara ainda" },
];

type Note = { id: string; body: string; created_at: string };

export function AdminIncidents({ incidents }: { incidents: Incident[] }) {
  const router = useRouter();
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingResolve, setPendingResolve] = useState<Incident | null>(null);
  const [notesByIncident, setNotesByIncident] = useState<Record<string, Note[]>>({});
  const [draftByIncident, setDraftByIncident] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setNotice(null);
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
      if (!response.ok) { setNotice({ text: "Não foi possível registrar o incidente.", tone: "error" }); return; }
      event.currentTarget.reset();
      router.refresh();
    } finally { setSaving(false); }
  }

  async function resolve(id: string) {
    setSaving(true); setNotice(null);
    try {
      const response = await fetch(`/api/admin/incidents/${id}/resolve`, { method: "POST" });
      if (!response.ok) { setNotice({ text: "Não foi possível encerrar o incidente.", tone: "error" }); return; }
      router.refresh();
    } finally { setSaving(false); }
  }

  async function addNote(incidentId: string) {
    const draft = (draftByIncident[incidentId] ?? "").trim();
    if (!draft) return;
    setSaving(true); setNotice(null);
    try {
      const response = await fetch(`/api/admin/incidents/${incidentId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      if (!response.ok) { setNotice({ text: "Não foi possível adicionar a nota.", tone: "error" }); return; }
      const json = (await response.json()) as { note: Note };
      setNotesByIncident((current) => ({
        ...current,
        [incidentId]: [...(current[incidentId] ?? []), json.note],
      }));
      setDraftByIncident((current) => ({ ...current, [incidentId]: "" }));
      setNotice({ text: "Nota adicionada.", tone: "success" });
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
      {notice && <p className={`notice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</p>}
      <div className="activity-list">
        {incidents.length === 0 && <p>Nenhum incidente registrado.</p>}
        {incidents.map((incident) => {
          const categoryLabel = categoryOptions.find((option) => option.value === incident.category)?.label ?? incident.category;
          const notes = notesByIncident[incident.id] ?? [];
          const expanded = expandedId === incident.id;
          return (
            <Card key={incident.id} padding="compact" className="ops-incident-card">
              <article>
                <p><strong>{categoryLabel}</strong> · <Badge tone={incident.status === "open" ? "amber" : "accent"}>{incident.status}</Badge></p>
                <p>{incident.summary}</p>
                {incident.correlation_id && <p>ID: {incident.correlation_id}</p>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="text-button" onClick={() => setExpandedId(expanded ? null : incident.id)}>
                    {expanded ? "Fechar notas" : "Notas"}
                  </button>
                  {incident.status === "open" && (
                    <button type="button" className="text-button" disabled={saving} onClick={() => setPendingResolve(incident)}>
                      Encerrar
                    </button>
                  )}
                </div>
              </article>
              {expanded && (
                <div className="ops-incident-notes">
                  {notes.length === 0 ? (
                    <p style={{ color: "var(--admin-muted)", fontSize: 12 }}>Sem notas ainda.</p>
                  ) : (
                    <ul>
                      {notes.map((note) => (
                        <li key={note.id}>
                          <small>{new Date(note.created_at).toLocaleString("pt-BR")}</small>
                          <p>{note.body}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={draftByIncident[incident.id] ?? ""}
                      onChange={(event) => setDraftByIncident((current) => ({ ...current, [incident.id]: event.target.value }))}
                      placeholder="Anote o andamento da investigação…"
                    />
                    <button type="button" className="button" disabled={saving || !(draftByIncident[incident.id] ?? "").trim()} onClick={() => void addNote(incident.id)}>
                      {saving ? "Salvando…" : "Adicionar nota"}
                    </button>
                  </div>
                </div>
              )}
            </Card>
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
