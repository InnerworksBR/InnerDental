"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Incident = { id: string; category: string; status: string; summary: string; correlation_id: string | null; opened_at: string };
const categories = ["validation", "google_calendar", "supabase", "evolution", "worker", "unknown"];

export function AdminIncidents({ incidents }: { incidents: Incident[] }) {
  const router = useRouter(); const [notice, setNotice] = useState(""); const [saving, setSaving] = useState(false);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setNotice(""); const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: form.get("category"), summary: form.get("summary"), correlationId: form.get("correlationId") || undefined }) });
      if (!response.ok) { setNotice("Não foi possível registrar o incidente."); return; }
      event.currentTarget.reset(); router.refresh();
    } finally { setSaving(false); }
  }
  async function resolve(id: string) {
    if (!confirm("Encerrar este incidente?")) return; setSaving(true); setNotice("");
    try { const response = await fetch(`/api/admin/incidents/${id}/resolve`, { method: "POST" }); if (!response.ok) { setNotice("Não foi possível encerrar o incidente."); return; } router.refresh(); } finally { setSaving(false); }
  }
  return <section className="card"><h2>Incidentes</h2><form className="incident-form" onSubmit={create}><label htmlFor="incident-category">Origem</label><select id="incident-category" name="category" defaultValue="unknown">{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select><label htmlFor="incident-summary">Resumo</label><input id="incident-summary" name="summary" required minLength={1} maxLength={500} /><label htmlFor="incident-correlation">Correlation ID (opcional)</label><input id="incident-correlation" name="correlationId" minLength={8} maxLength={80} /><button className="button" disabled={saving}>{saving ? "Salvando…" : "Registrar incidente"}</button></form>{notice && <p className="notice" role="status">{notice}</p>}<div className="activity-list">{incidents.length === 0 && <p>Nenhum incidente registrado.</p>}{incidents.map((incident) => <article key={incident.id}><p><strong>{incident.category}</strong> · {incident.status}</p><p>{incident.summary}</p>{incident.correlation_id && <p>ID: {incident.correlation_id}</p>}{incident.status === "open" && <button className="text-button" disabled={saving} onClick={() => void resolve(incident.id)}>Encerrar</button>}</article>)}</div></section>;
}
