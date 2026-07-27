import { NextResponse } from "next/server";
import { evolutionWebhookSchema, normalizeIncomingMessage } from "@/integrations/evolution/contract";
import { verifyEvolutionApiKey } from "@/integrations/evolution/signature";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { correlationIdFrom, log } from "@/lib/observability/logger";

export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  const body = await request.text();
  try {
    const payload = evolutionWebhookSchema.parse(JSON.parse(body));
    const providedApiKey = request.headers.get("apikey") ?? payload.apikey;
    if (!verifyEvolutionApiKey(providedApiKey, process.env.EVOLUTION_API_KEY ?? "")) {
      log("warn", "evolution_auth_rejected", { correlationId });
      return NextResponse.json({ error: "AUTENTICACAO_INVALIDA", correlationId }, { status: 401 });
    }
    const incoming = normalizeIncomingMessage(payload);
    if (!incoming) return NextResponse.json({ accepted: true, correlationId }, { status: 202 });
    const { error } = await createSupabaseAdminClient().from("whatsapp_inbox").upsert({ external_id: incoming.externalId, phone: incoming.phone, message_text: incoming.text }, { onConflict: "external_id", ignoreDuplicates: true });
    if (error) throw error;
    return NextResponse.json({ accepted: true, correlationId }, { status: 202 });
  } catch (error) {
    log("warn", "evolution_payload_rejected", { correlationId, error });
    return NextResponse.json({ error: "PAYLOAD_INVALIDO", correlationId }, { status: 400 });
  }
}
