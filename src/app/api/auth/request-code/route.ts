import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { issueOtp } from "@/lib/auth/otp";
import { normalizeBrazilianPhone } from "@/lib/phone/normalize";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { encryptOtp } from "@/lib/messaging/otp-cipher";
import { correlationIdFrom, log } from "@/lib/observability/logger";
import { assertTrustedMutation } from "@/lib/security/request-origin";

export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    assertTrustedMutation(request);
    const body = await request.json();
    const phone = normalizeBrazilianPhone(String(body.phone ?? ""));
    const otp = issueOtp();
    const client = createSupabaseAdminClient();
    const { data: accessTokenId, error } = await client.rpc("issue_otp_challenge", { p_phone: phone, p_token_hash: otp.codeHash, p_session_id: randomUUID() });
    if (error || !accessTokenId) throw error ?? new Error("OTP_RATE_LIMITED");
    const secret = process.env.OTP_ENCRYPTION_SECRET;
    if (!secret) throw new Error("OTP_DELIVERY_NOT_CONFIGURED");
    const { error: deliveryError } = await client.from("otp_delivery_secrets").insert({ access_token_id: accessTokenId, encrypted_code: encryptOtp(otp.code, secret) });
    if (deliveryError) throw deliveryError;
  } catch (error) {
    log("warn", "otp_request_rejected", { correlationId, error });
    // A resposta uniforme evita enumeração de pacientes e detalhes operacionais.
  }
  return NextResponse.json({ message: "Se o número puder receber mensagens, enviaremos um código em instantes.", correlationId }, { status: 202 });
}
