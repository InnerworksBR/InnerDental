import { NextResponse } from "next/server";
import { z } from "zod";
import { CalendarBlockConflictError, CalendarBlockReconciliationError, createAllDayCalendarBlock } from "@/lib/admin/calendar-blocks";
import { InternalAccessError, requireInternalAccess } from "@/lib/admin/authorization";
import { correlationIdFrom, log } from "@/lib/observability/logger";
import { assertTrustedMutation, UntrustedOriginError } from "@/lib/security/request-origin";

const schema = z.object({ professionalId: z.uuid(), date: z.iso.date(), idempotencyKey: z.uuid() });

export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    assertTrustedMutation(request);
    const actor = await requireInternalAccess();
    const body = schema.parse(await request.json());
    const block = await createAllDayCalendarBlock({ ...body, actorId: actor.userId });
    return NextResponse.json({ block, correlationId }, { status: 201 });
  } catch (error) {
    log("warn", "admin_calendar_block_rejected", { correlationId, error });
    if (error instanceof UntrustedOriginError) return NextResponse.json({ error: "ORIGEM_NAO_CONFIAVEL", correlationId }, { status: 403 });
    if (error instanceof InternalAccessError) return NextResponse.json({ error: error.code, correlationId }, { status: error.code === "INTERNAL_FORBIDDEN" ? 403 : 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId }, { status: 400 });
    if (error instanceof CalendarBlockConflictError) return NextResponse.json({ error: "DATA_JA_BLOQUEADA", correlationId }, { status: 409 });
    if (error instanceof CalendarBlockReconciliationError) return NextResponse.json({ error: "BLOQUEIO_EM_RECONCILIACAO", correlationId }, { status: 503 });
    return NextResponse.json({ error: "OPERACAO_INDISPONIVEL", correlationId }, { status: 503 });
  }
}
