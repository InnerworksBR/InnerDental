import "server-only";

import { z } from "zod";

import { classifyConversation, type ClassificationResponse } from "@/integrations/openai/conversation-classifier";
import { phoneHash } from "@/domain/conversation-analysis/hash";
import { maskConversationForLlm, type RawConversationMessage } from "@/domain/conversation-analysis/mask";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const WindowSchema = z.enum(["24h", "7d", "30d"]);
export type Window = z.infer<typeof WindowSchema>;
export type AnalysisWindow = Window;

export const OutcomeSchema = z.enum(["success", "confused", "abandoned", "error", "handoff_needed", "spam"]);
export type Outcome = z.infer<typeof OutcomeSchema>;

export type AnalyzeInput = {
  conversationKey?: string;
  window: Window;
  messages: RawConversationMessage[];
  intent?: string | null;
  action?: string | null;
  lastError?: string | null;
  correlationIds?: string[];
  actorId?: string | null;
};

export type AnalysisLog = {
  id: string;
  conversation_key: string;
  range_window: Window;
  outcome: Outcome;
  confidence: number;
  summary: string;
  evidence: Record<string, unknown>;
  correlation_ids: string[];
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  analyzed_at: string;
  resolved: boolean;
  resolved_at: string | null;
};

export type AggregatedAnalysis = {
  window: Window;
  total: number;
  problematic: number;
  percentage: number;
  byOutcome: Record<Outcome, number>;
  topProblematic: AnalysisLog[];
};

export async function analyzeConversation(input: AnalyzeInput): Promise<{ log: AnalysisLog; classification: ClassificationResponse }> {
  const masked = maskConversationForLlm(input.messages);
  const derivedKey = input.conversationKey ?? (masked[0]?.correlationId ?? `adhoc-${Date.now()}`);
  const key = input.conversationKey && /^[a-f0-9]{16}$/.test(input.conversationKey) ? input.conversationKey : phoneHash(derivedKey);
  const classification = await classifyConversation({
    messages: input.messages,
    intent: input.intent,
    action: input.action,
    lastError: input.lastError,
    correlationIds: input.correlationIds,
  });

  const client = createSupabaseAdminClient();
  const evidence = {
    intent: input.intent ?? null,
    action: input.action ?? null,
    last_error: input.lastError ?? null,
    correlation_ids: input.correlationIds ?? [],
    message_count: input.messages.length,
  };
  const { data, error } = await client
    .from("conversation_analysis_logs")
    .insert({
      conversation_key: key,
      range_window: input.window,
      outcome: classification.outcome,
      confidence: classification.confidence,
      summary: classification.summary,
      evidence,
      correlation_ids: input.correlationIds ?? [],
      model: classification.model,
      prompt_tokens: classification.usage.promptTokens,
      completion_tokens: classification.usage.completionTokens,
      analyzed_by: input.actorId ?? null,
    })
    .select("id,conversation_key,range_window,outcome,confidence,summary,evidence,correlation_ids,model,prompt_tokens,completion_tokens,analyzed_at,resolved,resolved_at")
    .single();
  if (error || !data) throw new Error("ANALYSIS_PERSIST_FAILED");
  return { log: data as AnalysisLog, classification };
}

const WINDOW_HOURS: Record<Window, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };

function emptyAggregated(window: Window): AggregatedAnalysis {
  return {
    window,
    total: 0,
    problematic: 0,
    percentage: 0,
    byOutcome: {
      success: 0,
      confused: 0,
      abandoned: 0,
      error: 0,
      handoff_needed: 0,
      spam: 0,
    },
    topProblematic: [],
  };
}

export async function getRecentAnalysis(window: Window): Promise<AggregatedAnalysis> {
  const client = createSupabaseAdminClient();
  const hours = WINDOW_HOURS[window];
  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  let rows: AnalysisLog[] = [];
  try {
    const { data, error } = await client
      .from("conversation_analysis_logs")
      .select("id,conversation_key,range_window,outcome,confidence,summary,evidence,correlation_ids,model,prompt_tokens,completion_tokens,analyzed_at,resolved,resolved_at")
      .gte("analyzed_at", sinceIso)
      .order("analyzed_at", { ascending: false })
      .limit(500);
    if (error) return emptyAggregated(window);
    rows = (data ?? []) as AnalysisLog[];
  } catch {
    return emptyAggregated(window);
  }
  const total = rows.length;
  const byOutcome = emptyAggregated(window).byOutcome;
  for (const row of rows) byOutcome[row.outcome] += 1;
  const problematic = total - byOutcome.success;
  const percentage = total === 0 ? 0 : (problematic / total) * 100;
  const topProblematic = rows.filter((row) => row.outcome !== "success").slice(0, 25);
  return { window, total, problematic, percentage, byOutcome, topProblematic };
}

export async function markResolved(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const client = createSupabaseAdminClient();
  const { error } = await client
    .from("conversation_analysis_logs")
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error("ANALYSIS_RESOLVE_FAILED");
}
