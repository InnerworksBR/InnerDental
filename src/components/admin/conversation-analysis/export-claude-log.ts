import type { AggregatedAnalysis, AnalysisLog, Outcome } from "@/domain/conversation-analysis/service";

const OUTCOME_LABEL: Record<Outcome, string> = {
  success: "success",
  confused: "confused",
  abandoned: "abandoned",
  error: "error",
  handoff_needed: "handoff_needed",
  spam: "spam",
};

const ARCHIVES: Record<Outcome, string[]> = {
  confused: ["src/domain/knowledge/", "src/domain/messaging/router-tools.ts"],
  abandoned: ["src/domain/knowledge/", "src/domain/messaging/router-tools.ts"],
  error: ["src/lib/observability/", "supabase/migrations/"],
  handoff_needed: ["src/domain/messaging/handoff.ts"],
  spam: ["src/integrations/evolution/"],
  success: [],
};

export function buildClaudeMarkdown(analysis: AggregatedAnalysis): string {
  const generatedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date());
  const total = analysis.total;
  const problematic = analysis.problematic;
  const percentage = total === 0 ? "0.0" : analysis.percentage.toFixed(1);
  const breakdown = (Object.entries(analysis.byOutcome) as [Outcome, number][])
    .sort((left, right) => right[1] - left[1])
    .map(([outcome, count]) => {
      const pct = total === 0 ? "0.0" : ((count / total) * 100).toFixed(1);
      return `- ${OUTCOME_LABEL[outcome]}: ${count} (${pct}%)`;
    })
    .join("\n");

  const issues = analysis.topProblematic.map((log) => issueBlock(log)).join("\n\n");

  return [
    "# Luna Agenda — Log de conversas problemáticas",
    "",
    `Gerado em: ${generatedAt}`,
    `Janela: ${analysis.window} | Total: ${total} | Problemáticas: ${problematic} (${percentage}%)`,
    "",
    "## Breakdown por outcome",
    breakdown,
    "",
    "## Issues",
    issues,
    "---",
    "",
  ].join("\n");
}

function issueBlock(log: AnalysisLog): string {
  const evidence = log.evidence as Record<string, unknown>;
  const intent = evidence.intent ?? "n/a";
  const action = evidence.action ?? "n/a";
  const lastError = evidence.last_error ?? "null";
  const messageCount = evidence.message_count ?? 0;
  const correlationIds = log.correlation_ids.length ? log.correlation_ids.join(", ") : "nenhum";
  const archives = ARCHIVES[log.outcome];
  const files = archives.length ? archives.map((path) => `- ${path}`).join("\n") : "- (sem arquivos candidatos)";

  return [
    `### [${OUTCOME_LABEL[log.outcome]}] conv_${log.conversation_key} — confiança ${log.confidence.toFixed(2)}`,
    `**Resumo:** ${log.summary}`,
    `**Evidência:**`,
    `- intent: ${intent}`,
    `- action: ${action}`,
    `- last_error: ${lastError}`,
    `- correlation_ids: ${correlationIds}`,
    `- message_count: ${messageCount}`,
    "",
    "**Reproduction steps:**",
    "1. Enviar mensagem correspondente no WhatsApp sandbox.",
    `2. Observar worker chamando o router em src/integrations/openai/chat.ts.`,
    `3. Conferir que outcome esperado difere de "${OUTCOME_LABEL[log.outcome]}".`,
    `4. Coletar logs estruturados via correlation_id e identificar a tool chamada.`,
    `5. Validar grounding em src/integrations/openai/grounding.ts.`,
    "",
    "**Arquivos prováveis a investigar:**",
    files,
    "",
    `**Sinais para correlacionar:**`,
    `- analyzed_at: ${log.analyzed_at}`,
    `- analysis_id: ${log.id}`,
    `- conversation_key: conv_${log.conversation_key}`,
  ].join("\n");
}
