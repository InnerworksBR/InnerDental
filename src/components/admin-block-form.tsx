"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminBlockForm({ date, professionals }: { date: string; professionals: { id: string; name: string }[] }) {
  const router = useRouter();
  const [professionalId, setProfessionalId] = useState(professionals[0]?.id ?? "");
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const selectedName = professionals.find((item) => item.id === professionalId)?.name ?? "o profissional";
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date(`${date}T12:00:00-03:00`));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!professionalId || !confirming) return;
    setSaving(true); setNotice(null);
    try {
      const response = await fetch("/api/admin/calendar-blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ professionalId, date, idempotencyKey: crypto.randomUUID() }) });
      if (response.ok) {
        setNotice({ text: "Dia bloqueado no Google Calendar e na agenda interna.", tone: "success" });
        setConfirming(false);
        router.refresh();
        return;
      }
      const body = await response.json().catch(() => ({}));
      setNotice({ text: body.error === "BLOQUEIO_EM_RECONCILIACAO" ? "O Calendar não confirmou o bloqueio. A operação ficou em reconciliação." : "Não foi possível bloquear este dia.", tone: "error" });
    } finally { setSaving(false); }
  }

  return <form className="admin-inline-form" onSubmit={submit}>
    <label htmlFor="block-professional">Profissional</label>
    <select id="block-professional" value={professionalId} onChange={(event) => { setProfessionalId(event.target.value); setConfirming(false); }} disabled={saving}>
      <option value="">Selecione o profissional</option>
      {professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
    </select>
    <small className="ops-form-help">O bloqueio ocupará o dia inteiro e removerá a data das opções de agendamento.</small>
    {!confirming ? <button type="button" className="button" disabled={saving || !professionalId} onClick={() => setConfirming(true)}>Revisar bloqueio</button> : <div className="ops-inline-confirm" role="group" aria-label="Confirmar bloqueio">
      <p><b>Confirmar bloqueio?</b><span>{selectedName} ficará indisponível em {dateLabel}.</span></p>
      <div><button type="button" className="text-button" disabled={saving} onClick={() => setConfirming(false)}>Voltar</button><button className="button" disabled={saving}>{saving ? "Bloqueando…" : "Confirmar"}</button></div>
    </div>}
    {notice && <p className={`notice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</p>}
  </form>;
}
