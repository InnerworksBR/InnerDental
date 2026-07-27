import { NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth/session";
import { assertTrustedMutation, UntrustedOriginError } from "@/lib/security/request-origin";
import { correlationIdFrom } from "@/lib/observability/logger";

export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    assertTrustedMutation(request);
    const response = NextResponse.json({ ok: true, correlationId });
    response.cookies.set(sessionCookieName, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: new Date(0),
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (error) {
    if (error instanceof UntrustedOriginError) return NextResponse.json({ error: "ORIGEM_NAO_CONFIAVEL", correlationId }, { status: 403 });
    return NextResponse.json({ error: "OPERACAO_INDISPONIVEL", correlationId }, { status: 503 });
  }
}
