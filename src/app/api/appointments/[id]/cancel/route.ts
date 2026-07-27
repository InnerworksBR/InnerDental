import { NextResponse } from "next/server";
import { z } from "zod";
import { getGoogleCalendarAccessToken } from "@/integrations/google-calendar/auth";
import { AppointmentPolicyError, cancelPatientAppointment } from "@/lib/appointments/service";
import { requirePatientSession } from "@/lib/auth/patient-guard";
import { correlationIdFrom, log } from "@/lib/observability/logger";
import { assertTrustedMutation, UntrustedOriginError } from "@/lib/security/request-origin";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ idempotencyKey: z.uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const correlationId = correlationIdFrom(request);
  try {
    assertTrustedMutation(request);
    const session = await requirePatientSession(); const { id } = paramsSchema.parse(await context.params); const body = bodySchema.parse(await request.json());
    const token = await getGoogleCalendarAccessToken();
    const appointment = await cancelPatientAppointment({ ...body, appointmentId: id, phone: session.phone, token });
    return NextResponse.json({ appointment, correlationId });
  } catch (error) {
    log("warn", "appointment_cancel_rejected", { correlationId, error });
    if (error instanceof UntrustedOriginError) return NextResponse.json({ error: "ORIGEM_NAO_CONFIAVEL", correlationId }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId }, { status: 400 });
    if (error instanceof AppointmentPolicyError) return NextResponse.json({ error: error.message, correlationId }, { status: 422 });
    if (error instanceof Error && ["OPERATION_IN_PROGRESS", "RECONCILIATION_REQUIRED"].includes(error.message)) return NextResponse.json({ error: "OPERACAO_EM_ANDAMENTO", correlationId }, { status: 409 });
    if (error instanceof Error && ["APPOINTMENT_NOT_FOUND", "APPOINTMENT_NOT_AVAILABLE"].includes(error.message)) return NextResponse.json({ error: "CONSULTA_NAO_ENCONTRADA", correlationId }, { status: 404 });
    return NextResponse.json({ error: "AGENDA_INDISPONIVEL", correlationId }, { status: 503 });
  }
}
