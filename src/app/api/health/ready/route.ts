import { NextResponse } from "next/server";
import { getGoogleCalendarAccessToken } from "@/integrations/google-calendar/auth";
import { EvolutionClient } from "@/integrations/evolution/client";
import { openAIReady } from "@/integrations/openai/readiness";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { log } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

async function databaseReady() {
  try {
    const client = createSupabaseAdminClient();
    const checks = Promise.all([
      client.from("professionals").select("id").limit(1),
      // This RPC exists only after the definitive catalog migrations and also
      // verifies the physical normalized-term registry at runtime.
      client.rpc("whatsapp_routing_schema_ready"),
    ]).then(([connection, schema]) => ({ connection, schema }));
    const timeout = new Promise<{ timeout: true }>((resolve) => setTimeout(() => resolve({ timeout: true }), 2_500));
    const result = await Promise.race([checks, timeout]);
    if ("timeout" in result || result.connection.error) return "unavailable";
    return result.schema.error || result.schema.data !== true ? "schema_unavailable" : "ok";
  } catch { return "unavailable"; }
}

async function calendarReady() {
  try { await getGoogleCalendarAccessToken(); return true; }
  catch { return false; }
}

function portalReady(environment: NodeJS.ProcessEnv = process.env) {
  try {
    const url = new URL(environment.PORTAL_BASE_URL ?? "");
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return environment.NODE_ENV !== "production" || (url.protocol === "https:" && !["localhost", "127.0.0.1"].includes(url.hostname));
  } catch { return false; }
}

async function evolutionReady(environment: NodeJS.ProcessEnv = process.env) {
  try {
    const url = new URL(environment.EVOLUTION_BASE_URL ?? "");
    const apiKey = environment.EVOLUTION_API_KEY?.trim();
    const instance = environment.EVOLUTION_INSTANCE?.trim();
    if (!["http:", "https:"].includes(url.protocol) || !apiKey || !instance) return false;
    return (await new EvolutionClient({ baseUrl: url.toString(), apiKey, instance }).connectionState()) === "open";
  } catch { return false; }
}

export async function GET() {
  const [database, calendar, openai, evolution] = await Promise.all([databaseReady(), calendarReady(), openAIReady(), evolutionReady()]);
  const dependencies = {
    database,
    calendar: calendar ? "ok" : "unavailable",
    // OpenAI is only an optional wording layer for an already selected FAQ. Its
    // absence must be visible, but cannot make the deterministic service unready.
    openai: process.env.OPENAI_API_KEY?.trim() ? (openai ? "ok" : "unavailable") : "disabled",
    evolution: evolution ? "ok" : "unavailable",
    otpEncryption: (process.env.OTP_ENCRYPTION_SECRET?.length ?? 0) >= 32 ? "configured" : "unavailable",
    portal: portalReady() ? "configured" : "unavailable",
  };
  const ready = [dependencies.database, dependencies.calendar, dependencies.evolution, dependencies.otpEncryption, dependencies.portal]
    .every((state) => state === "ok" || state === "configured");
  if (!ready) log("warn", "readiness_failed", dependencies);
  return NextResponse.json({ status: ready ? "ready" : "not_ready", dependencies }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
