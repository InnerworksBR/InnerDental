import { NextResponse } from "next/server";
import { evolutionWebhookSchema, normalizeFromMeActivity, normalizeIncomingMessage } from "@/integrations/evolution/contract";
import { whatsappMessageFingerprint } from "@/domain/messaging/fingerprint";
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
    const db = createSupabaseAdminClient();
    const fromMe = normalizeFromMeActivity(payload);
    if (fromMe) {
      const { data: disposition, error } = await db.rpc("register_whatsapp_from_me_activity", {
        p_external_id: fromMe.externalId,
        p_phone: fromMe.phone,
        p_message_fingerprint: fromMe.text ? whatsappMessageFingerprint(fromMe.phone, fromMe.text) : null,
        p_pause_minutes: 120,
      });
      if (error) throw error;
      log("info", "whatsapp_from_me_processed", { correlationId, disposition });
      return NextResponse.json({ accepted: true, correlationId }, { status: 202 });
    }
    const incoming = normalizeIncomingMessage(payload);
    if (!incoming) return NextResponse.json({ accepted: true, correlationId }, { status: 202 });
    const { error } = await db.rpc("ingest_whatsapp_message", { p_external_id: incoming.externalId, p_phone: incoming.phone, p_message_text: incoming.text });
    if (error) throw error;
    return NextResponse.json({ accepted: true, correlationId }, { status: 202 });
  } catch (error) {
    log("warn", "evolution_payload_rejected", { correlationId, error });
    return NextResponse.json({ error: "PAYLOAD_INVALIDO", correlationId }, { status: 400 });
  }
}
