import { NextResponse } from "next/server";
import { z } from "zod";
import { CalendarUnavailableError } from "@/domain/availability/service";
import { getGoogleCalendarAccessToken } from "@/integrations/google-calendar/auth";
import { requirePatientSession } from "@/lib/auth/patient-guard";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createPatientAppointment, listReconciledPatientAppointments } from "@/lib/appointments/service";
import { patientProfileForPhone } from "@/lib/appointments/repository";
import { correlationIdFrom, log } from "@/lib/observability/logger";
import { assertTrustedMutation, UntrustedOriginError } from "@/lib/security/request-origin";

export const patientAppointmentSchema = z.object({
  professionalId: z.uuid(),
  holdId: z.uuid(),
  date: z.iso.date(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  idempotencyKey: z.uuid(),
  patientName: z.string().trim().min(2).max(160).optional(),
  insurancePlanId: z.uuid().optional(),
  partySize: z.union([z.literal(1), z.literal(2)]).default(1),
  companionName: z.string().trim().min(2).max(160).optional(),
}).superRefine((value, context) => {
  if (value.partySize === 2 && !value.companionName) {
    context.addIssue({ code: "custom", path: ["companionName"], message: "Nome da segunda pessoa é obrigatório" });
  }
});

export async function GET(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    const session = await requirePatientSession();
    const token = await getGoogleCalendarAccessToken();
    const now = new Date().toISOString();
    const [appointments, profile] = await Promise.all([
      listReconciledPatientAppointments(session.phone, token).then((items) => items.filter((appointment) => appointment.start_at >= now && appointment.status !== "cancelled")),
      patientProfileForPhone(session.phone),
    ]);
    return NextResponse.json({ appointments, profile, correlationId });
  } catch (error) {
    log("warn", "appointments_list_rejected", { correlationId, error });
    if (error instanceof CalendarUnavailableError) return NextResponse.json({ error: "AGENDA_INDISPONIVEL", correlationId }, { status: 503 });
    return NextResponse.json({ error: "NAO_AUTORIZADO", correlationId }, { status: 401 });
  }
}

export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    assertTrustedMutation(request);
    const session = await requirePatientSession();
    const body = patientAppointmentSchema.parse(await request.json());
    const profile = await patientProfileForPhone(session.phone);
    if (!profile.complete && (!body.patientName || !body.insurancePlanId)) return NextResponse.json({ error: "CADASTRO_INCOMPLETO", correlationId }, { status: 400 });
    const insurancePlanId = body.insurancePlanId ?? profile.insurancePlanId;
    if (!insurancePlanId) return NextResponse.json({ error: "CADASTRO_INCOMPLETO", correlationId }, { status: 400 });
    const { data: plan } = await createSupabaseAdminClient().from("insurance_plans").select("id").eq("id", insurancePlanId).eq("active", true).maybeSingle();
    if (!plan) return NextResponse.json({ error: "PLANO_INVALIDO", correlationId }, { status: 400 });
    const token = await getGoogleCalendarAccessToken();
    const appointment = await createPatientAppointment({
      ...body,
      companionName: body.partySize === 2 ? body.companionName : undefined,
      patientName: body.patientName ?? profile.name ?? undefined,
      insurancePlanId,
      phone: session.phone,
      sessionId: session.sessionId,
      token,
    });
    return NextResponse.json({ appointment, correlationId }, { status: 201 });
  } catch (error) {
    log("warn", "appointment_create_rejected", { correlationId, error });
    if (error instanceof UntrustedOriginError) return NextResponse.json({ error: "ORIGEM_NAO_CONFIAVEL", correlationId }, { status: 403 });
    if (error instanceof CalendarUnavailableError) return NextResponse.json({ error: "AGENDA_INDISPONIVEL", correlationId }, { status: 503 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId }, { status: 400 });
    if (error instanceof Error && ["SLOT_UNAVAILABLE", "OPERATION_IN_PROGRESS"].includes(error.message)) return NextResponse.json({ error: "SLOT_INDISPONIVEL", correlationId }, { status: 409 });
    return NextResponse.json({ error: "NAO_AUTORIZADO", correlationId }, { status: 401 });
  }
}
