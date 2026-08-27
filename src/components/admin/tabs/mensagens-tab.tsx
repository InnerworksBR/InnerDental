"use client";

import { useCallback, useMemo, useState } from "react";

import { Badge } from "../badge";
import { Card } from "../card";
import { EmptyState } from "../empty-state";
import { LivePulse } from "../live-pulse";
import { PageHeader } from "../page-header";
import { SectionHeader } from "../section-header";
import { usePolling } from "../live-feed/use-polling";
import { ConversationAnalysisKpi } from "../conversation-analysis/kpi-card";
import { buildClaudeMarkdown } from "../conversation-analysis/export-claude-log";
import type { AggregatedAnalysis, AnalysisWindow, Incident, MainTab } from "./types";

type Props = {
  initialInbox: { id: string; phone: string; classified_intent: string | null; processed_action: string | null; status: string; created_at: string }[];
  initialOutbox: { id: string; event_type: string; status: string; attempts: number; created_at: string }[];
  initialIncidents: Incident[];
  initialAnalysis: AggregatedAnalysis;
};

export function MensagensTab({ initialInbox, initialOutbox, initialIncidents, initialAnalysis }: Props) {
  const [tab] = useState<MainTab>("Mensagens");
  const [window, setWindow] = useState<AnalysisWindow>("24h");
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const fetcher = useCallback(async () => {
    const response = await fetch(`/api/admin/activity?since=${encodeURIComponent(new Date(Date.now() - 60_000).toISOString())}&limit=50`, { cache: "no-store" });
    if (!response.ok) throw new Error("ACTIVITY_FETCH_FAILED");
    return response.json() as Promise<{ inbox: typeof initialInbox; outbox: typeof initialOutbox; incidents: { id: string; category: string; status: string; summary: string; correlationId: string | null; openedAt: string }[] }>;
  }, []);

  const activity = usePolling(fetcher, { enabled: true, intervalMs: 10_000 });

  const analysisFetcher = useCallback(async () => {
    const response = await fetch(`/api/admin/conversation-analysis?window=${window}`, { cache: "no-store" });
    if (!response.ok) throw new Error("ANALYSIS_FETCH_FAILED");
    return response.json() as Promise<AggregatedAnalysis & { correlationId?: string }>;
  }, [window]);

  const analysis = usePolling(analysisFetcher, { enabled: true, intervalMs: 60_000 });

  const inboxMap = useMemo(() => {
    const map = new Map(initialInbox.map((entry) => [entry.id, entry]));
    for (const entry of activity.data?.inbox ?? []) map.set(entry.id, { ...entry, created_at: (entry as { created_at?: string }).created_at ?? new Date().toISOString() } as typeof initialInbox[number]);
    return map;
  }, [initialInbox, activity.data]);

  const outboxMap = useMemo(() => {
    const map = new Map(initialOutbox.map((entry) => [entry.id, entry]));
    for (const entry of activity.data?.outbox ?? []) map.set(entry.id, entry as typeof initialOutbox[number]);
    return map;
  }, [initialOutbox, activity.data]);

  const incidentMap = useMemo(() => {
    const map = new Map(initialIncidents.map((entry) => [entry.id, entry]));
    return map;
  }, [initialIncidents]);

  const aggregated = analysis.data ?? initialAnalysis;

  const handleExport = useCallback(async () => {
    if (!aggregated) return;
    const markdown = buildClaudeMarkdown(aggregated);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(markdown);
        setExportNotice("Log copiado para a área de transferência.");
      } else {
        setExportNotice("Clipboard indisponível; exibindo no console.");
        console.info(markdown);
      }
    } catch {
      setExportNotice("Não foi possível copiar automaticamente.");
      console.info(markdown);
    }
  }, [aggregated]);

  const handleMarkResolved = useCallback(async (ids: string[]) => {
    await fetch("/api/admin/conversation-analysis", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    await analysis.refresh();
  }, [analysis]);

  return (
    <div data-tab={tab}>
      <PageHeader eyebrow="Comunicação" title="Mensagens" subtitle="WhatsApp, notificações automáticas e análise por IA" />
      <Card padding="compact" className="ops-message-toolbar">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <LivePulse label="Ao vivo" lastUpdatedAt={activity.lastUpdatedAt} />
          <button type="button" className="text-button" onClick={() => void activity.refresh()}>Atualizar agora</button>
        </div>
      </Card>
      <div style={{ marginTop: 16 }}>
        <ConversationAnalysisKpi
          data={aggregated}
          window={window}
          onWindowChange={setWindow}
          onExport={() => void handleExport()}
          onMarkResolved={(ids) => void handleMarkResolved(ids)}
        />
      </div>
      {exportNotice && <p className="notice success" role="status">{exportNotice}</p>}
      <div className="ops-message-columns" style={{ marginTop: 18 }}>
        <section>
          <SectionHeader eyebrow="Entrada" title="Recebidas" variant="column" meta={inboxMap.size} />
          <div className="ops-list" style={{ gap: 10 }}>
            {inboxMap.size === 0 ? (
              <EmptyState title="Nenhuma mensagem recebida" description="As mensagens do WhatsApp aparecerão aqui." />
            ) : (
              Array.from(inboxMap.values()).slice(0, 30).map((entry) => (
                <article className="ops-card" key={entry.id}>
                  <b>{entry.phone}</b>
                  <p>{entry.classified_intent ?? "Mensagem recebida"}</p>
                  <small>{entry.processed_action ?? entry.status}</small>
                  <Badge tone={entry.status === "dead-letter" ? "danger" : "muted"}>{entry.status}</Badge>
                </article>
              ))
            )}
          </div>
        </section>
        <section>
          <SectionHeader eyebrow="Saída" title="Notificações" variant="column" meta={outboxMap.size} />
          <div className="ops-list" style={{ gap: 10 }}>
            {outboxMap.size === 0 ? (
              <EmptyState title="Nenhuma notificação recente" description="Os envios automáticos aparecerão aqui." />
            ) : (
              Array.from(outboxMap.values()).slice(0, 30).map((entry) => (
                <article className="ops-card" key={entry.id}>
                  <b>{entry.event_type}</b>
                  <p>{entry.status}{entry.attempts ? ` · ${entry.attempts} tentativa(s)` : ""}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
      <section style={{ marginTop: 18 }}>
        <SectionHeader eyebrow="Incidentes" title="Abertos" meta={incidentMap.size} />
        <div className="ops-list" style={{ gap: 10 }}>
          {incidentMap.size === 0 ? (
            <EmptyState title="Sem incidentes abertos" description="Quando algo falhar, o painel categoriza automaticamente." />
          ) : (
            Array.from(incidentMap.values()).slice(0, 20).map((entry) => (
              <article className="ops-card" key={entry.id}>
                <b>{entry.category}</b>
                <p>{entry.summary}</p>
                {entry.correlation_id && <small>ID: {entry.correlation_id}</small>}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
