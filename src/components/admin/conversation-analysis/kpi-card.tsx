import type { AggregatedAnalysis, AnalysisLog, AnalysisWindow, Outcome } from "@/domain/conversation-analysis/service";
import { Badge } from "../badge";

type Props = {
  data: AggregatedAnalysis | null;
  window: AnalysisWindow;
  onWindowChange: (window: AnalysisWindow) => void;
  onExport: () => void;
  onMarkResolved: (ids: string[]) => void;
};

const OUTCOME_LABEL: Record<Outcome, string> = {
  success: "Resolvida",
  confused: "Confusa",
  abandoned: "Abandonada",
  error: "Erro",
  handoff_needed: "Handoff",
  spam: "Spam",
};

const WINDOWS: AnalysisWindow[] = ["24h", "7d", "30d"];

export function ConversationAnalysisKpi({ data, window, onWindowChange, onExport, onMarkResolved }: Props) {
  return (
    <section className="conv-kpi" aria-label="Análise de conversas">
      <header className="conv-kpi__head">
        <h2>Análise de conversas</h2>
        <div className="conv-kpi__window" role="tablist" aria-label="Janela de análise">
          {WINDOWS.map((value) => (
            <button key={value} type="button" role="tab" aria-selected={window === value} className={window === value ? "active" : ""} onClick={() => onWindowChange(value)}>
              {value}
            </button>
          ))}
          <button type="button" className="conv-kpi__export" onClick={onExport} aria-label="Exportar log para Claude Code">Exportar</button>
        </div>
      </header>
      <div className="conv-kpi__metrics">
        <div className="conv-kpi__metric">
          <b>{data?.total ?? 0}</b>
          <small>conversas analisadas</small>
        </div>
        <div className={`conv-kpi__metric ${data && data.problematic > 0 ? "conv-kpi__metric--danger" : ""}`}>
          <b>{data?.problematic ?? 0}</b>
          <small>problemáticas</small>
        </div>
        <div className={`conv-kpi__metric ${data && data.percentage > 20 ? "conv-kpi__metric--amber" : ""}`}>
          <b>{data ? `${data.percentage.toFixed(1)}%` : "0.0%"}</b>
          <small>taxa de falha</small>
        </div>
      </div>
      {data && data.total > 0 && (
        <div className="conv-outcome-bar">
          {(Object.entries(data.byOutcome) as [Outcome, number][])
            .filter(([, count]) => count > 0)
            .sort((left, right) => right[1] - left[1])
            .map(([outcome, count]) => {
              const pct = (count / data.total) * 100;
              return (
                <div className="conv-outcome-row" key={outcome}>
                  <small>{OUTCOME_LABEL[outcome]}</small>
                  <div className="ops-progress"><i style={{ width: `${pct}%` }} /></div>
                  <span>{count}</span>
                </div>
              );
            })}
        </div>
      )}
      {data && data.topProblematic.length > 0 && (
        <div className="conv-log-list">
          {data.topProblematic.map((log) => (
            <LogItem key={log.id} log={log} onMarkResolved={onMarkResolved} />
          ))}
        </div>
      )}
    </section>
  );
}

function LogItem({ log, onMarkResolved }: { log: AnalysisLog; onMarkResolved: (ids: string[]) => void }) {
  return (
    <article className="conv-log-item">
      <header className="conv-log-item__head">
        <b>conv_{log.conversation_key}</b>
        <small>{new Date(log.analyzed_at).toLocaleString("pt-BR")}</small>
      </header>
      <p>{log.summary}</p>
      <div className="conv-log-item__head">
        <Badge tone={log.outcome === "error" ? "danger" : log.outcome === "handoff_needed" ? "amber" : "muted"}>
          {OUTCOME_LABEL[log.outcome]} · {(log.confidence * 100).toFixed(0)}%
        </Badge>
        {!log.resolved && (
          <button type="button" onClick={() => onMarkResolved([log.id])}>Marcar resolvida</button>
        )}
        {log.resolved && <Badge tone="accent">resolvida</Badge>}
      </div>
    </article>
  );
}
