import { NextResponse } from "next/server";
import { consumeAccessToken } from "@/lib/auth/access-token-repository";
import { hashAccessToken } from "@/lib/auth/access-token";
import { createSession, sessionCookieName } from "@/lib/auth/session";
import { effectiveRequestOrigin } from "@/lib/security/request-origin";

export async function GET(request: Request) {
  let publicOrigin: string;
  try {
    publicOrigin = effectiveRequestOrigin(request);
  } catch {
    return new Response("Origem de acesso inválida.\n", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const redirect = (path: string) => NextResponse.redirect(new URL(path, publicOrigin));
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return redirect("/acesso?erro=link-invalido");
  let access; try { access = await consumeAccessToken(hashAccessToken(token)); } catch { access = null; }
  if (!access) return redirect("/acesso?erro=link-expirado");
  const response = redirect("/agenda");
  response.cookies.set(sessionCookieName, createSession(access.phone), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1800, path: "/" });
  return response;
}
