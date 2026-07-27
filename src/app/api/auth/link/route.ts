import { NextResponse } from "next/server";
import { consumeAccessToken } from "@/lib/auth/access-token-repository";
import { hashAccessToken } from "@/lib/auth/access-token";
import { createSession, sessionCookieName } from "@/lib/auth/session";

export async function GET(request: Request) {
  const url = new URL(request.url); const token = url.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/acesso?erro=link-invalido", url));
  let access; try { access = await consumeAccessToken(hashAccessToken(token)); } catch { access = null; }
  if (!access) return NextResponse.redirect(new URL("/acesso?erro=link-expirado", url));
  const response = NextResponse.redirect(new URL("/agenda", url));
  response.cookies.set(sessionCookieName, createSession(access.phone), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1800, path: "/" });
  return response;
}
