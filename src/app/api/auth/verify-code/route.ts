import { NextResponse } from "next/server";
import { verifyOtpChallenge } from "@/lib/auth/access-token-repository";
import { hashAccessToken } from "@/lib/auth/access-token";
import { createSession, sessionCookieName } from "@/lib/auth/session";
import { normalizeBrazilianPhone } from "@/lib/phone/normalize";
import { correlationIdFrom, log } from "@/lib/observability/logger";
import { assertTrustedMutation, UntrustedOriginError } from "@/lib/security/request-origin";

export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    assertTrustedMutation(request);
    const { phone, code } = await request.json();
    const normalizedPhone = normalizeBrazilianPhone(String(phone ?? ""));
    if (!/^\d{6}$/.test(String(code ?? ""))) throw new Error("INVALID_OTP_FORMAT");
    const access = await verifyOtpChallenge(normalizedPhone, hashAccessToken(String(code)));
    if (!access) throw new Error("INVALID_OTP");
    const response = NextResponse.json({ ok: true, correlationId });
    response.cookies.set(sessionCookieName, createSession(access.phone), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1800, path: "/" });
    return response;
  } catch (error) {
    log("warn", "otp_verification_rejected", { correlationId, error });
    if (error instanceof UntrustedOriginError) return NextResponse.json({ message: "Origem não confiável.", correlationId }, { status: 403 });
    return NextResponse.json({ message: "Código inválido ou expirado.", correlationId }, { status: 401 });
  }
}
