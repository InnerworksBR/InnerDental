import { timingSafeEqual } from "node:crypto";
import { renderPrometheusMetrics } from "@/lib/observability/metrics";

export const dynamic = "force-dynamic";

function matches(provided: string, expected: string) {
  const left = Buffer.from(provided); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function GET(request: Request) {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) return new Response("metrics disabled\n", { status: 503 });
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!matches(provided, expected)) return new Response("unauthorized\n", { status: 401 });
  return new Response(renderPrometheusMetrics(), { headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" } });
}
