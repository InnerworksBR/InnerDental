import { NextRequest, NextResponse } from "next/server";
import { correlationIdFrom } from "@/lib/observability/logger";
import { incrementCounter, observeHistogram } from "@/lib/observability/metrics";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const startedAt = performance.now();
  const correlationId = correlationIdFrom(request);
  const labels = { method: request.method, area: request.nextUrl.pathname.startsWith("/api/") ? "api" : "page" };
  const headers = new Headers(request.headers);
  headers.set("x-correlation-id", correlationId);
  const response = await updateSupabaseSession(new NextRequest(request, { headers }));
  const resultLabels = { ...labels, status: `${Math.floor(response.status / 100)}xx` };
  incrementCounter("luna_http_requests_total", "HTTP requests received by the web application.", resultLabels);
  observeHistogram("luna_http_request_duration_seconds", "HTTP request duration at the application edge.", resultLabels, (performance.now() - startedAt) / 1000);
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
