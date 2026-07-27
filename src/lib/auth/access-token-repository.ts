import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

type AccessTokenRecord = {
  phone: string;
  tokenHash: string;
  expiresAt: Date;
  sessionId: string;
};

export async function persistAccessToken(record: AccessTokenRecord): Promise<void> {
  const client = createSupabaseAdminClient();
  const { error } = await client.from("access_tokens").insert({
    phone: record.phone,
    token_hash: record.tokenHash,
    expires_at: record.expiresAt.toISOString(),
    session_id: record.sessionId,
    origin: "whatsapp_link",
  });

  if (error) throw new Error("Não foi possível emitir o acesso.");
}

export async function consumeAccessToken(tokenHash: string): Promise<{ phone: string; sessionId: string | null } | null> {
  const client = createSupabaseAdminClient();
  const { data, error } = await client.rpc("consume_access_token", { p_token_hash: tokenHash });

  if (error) throw new Error("Não foi possível validar o acesso.");
  if (!data?.[0]) return null;

  return { phone: data[0].phone, sessionId: data[0].session_id };
}

export async function verifyOtpChallenge(phone: string, tokenHash: string): Promise<{ phone: string; sessionId: string | null } | null> {
  const { data, error } = await createSupabaseAdminClient().rpc("verify_otp_challenge", {
    p_phone: phone,
    p_token_hash: tokenHash,
    p_max_attempts: 5,
  });
  if (error) throw new Error("Não foi possível validar o acesso.");
  if (!data?.[0]) return null;
  return { phone: data[0].phone, sessionId: data[0].session_id };
}
