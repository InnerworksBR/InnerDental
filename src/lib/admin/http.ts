import { NextResponse } from "next/server";
import { InternalAccessError } from "@/lib/admin/authorization";
import { correlationIdFrom, log } from "@/lib/observability/logger";

export function adminErrorResponse(request: Request, event: string, error: unknown) {
  const correlationId = correlationIdFrom(request);
  log("warn", event, { correlationId, error });
  if (error instanceof InternalAccessError) return NextResponse.json({ error: error.code, correlationId }, { status: error.code === "INTERNAL_FORBIDDEN" ? 403 : 401 });
  return NextResponse.json({ error: "OPERACAO_INDISPONIVEL", correlationId }, { status: 503 });
}
