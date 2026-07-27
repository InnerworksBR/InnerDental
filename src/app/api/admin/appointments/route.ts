import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminAppointment } from "@/lib/admin/appointments";
import { requireInternalAccess } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/http";
import { correlationIdFrom } from "@/lib/observability/logger";
import { assertTrustedMutation, UntrustedOriginError } from "@/lib/security/request-origin";

const schema = z.object({ patientId: z.uuid(), professionalId: z.uuid(), date: z.iso.date(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), idempotencyKey: z.uuid() });

export async function POST(request: Request) {
  try { assertTrustedMutation(request); const actor = await requireInternalAccess(); const appointment = await createAdminAppointment({ ...schema.parse(await request.json()), actorId: actor.userId }); return NextResponse.json({ appointment, correlationId: correlationIdFrom(request) }, { status: 201 }); }
  catch (error) { if (error instanceof UntrustedOriginError) return NextResponse.json({ error: "ORIGEM_NAO_CONFIAVEL", correlationId: correlationIdFrom(request) }, { status: 403 }); if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId: correlationIdFrom(request) }, { status: 400 }); if (error instanceof Error && ["SLOT_UNAVAILABLE", "OPERATION_IN_PROGRESS", "RECONCILIATION_REQUIRED"].includes(error.message)) return NextResponse.json({ error: error.message, correlationId: correlationIdFrom(request) }, { status: 409 }); return adminErrorResponse(request, "admin_appointment_create_rejected", error); }
}
