import { NextResponse } from "next/server";
import { consumeAccessToken } from "@/lib/auth/access-token-repository";
import { hashAccessToken } from "@/lib/auth/access-token";
import { createSession, sessionCookieName } from "@/lib/auth/session";
import { correlationIdFrom, log } from "@/lib/observability/logger";
import { assertTrustedMutation, effectiveRequestOrigin, UntrustedOriginError } from "@/lib/security/request-origin";

export async function GET(request: Request) {
  let publicOrigin: string;
  try {
    publicOrigin = effectiveRequestOrigin(request);
  } catch {
    return new Response("Origem de acesso inválida.\n", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, publicOrigin));
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return redirect("/acesso?erro=link-invalido");

  // Link previews follow GET requests. Keep the secret out of the next request and
  // let the browser explicitly redeem it with a same-origin POST.
  return redirect(`/acesso#token=${encodeURIComponent(token)}`);
}

export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);

  try {
    assertTrustedMutation(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Link inválido.", correlationId }, { status: 400 });
    }

    const token = typeof body === "object" && body !== null && "token" in body
      ? (body as { token?: unknown }).token
      : null;
    if (typeof token !== "string" || token.length === 0 || token.length > 256) {
      return NextResponse.json({ message: "Link inválido.", correlationId }, { status: 400 });
    }

    const access = await consumeAccessToken(hashAccessToken(token));
    if (!access) {
      return NextResponse.json({ message: "Link inválido ou expirado.", correlationId }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, correlationId });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(sessionCookieName, createSession(access.phone), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1800, path: "/" });
    return response;
  } catch (error) {
    if (error instanceof UntrustedOriginError) {
      return NextResponse.json({ message: "Origem não confiável.", correlationId }, { status: 403 });
    }
    log("error", "access_link_redemption_failed", { correlationId, error });
    return NextResponse.json({ message: "Não foi possível validar o link agora.", correlationId }, { status: 503 });
  }
}
