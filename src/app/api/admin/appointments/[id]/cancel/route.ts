import { NextResponse } from "next/server";
import { z } from "zod";
import { cancelAdminAppointment } from "@/lib/admin/appointments";
import { requireInternalAccess } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/http";
import { correlationIdFrom } from "@/lib/observability/logger";
import { assertTrustedMutation, UntrustedOriginError } from "@/lib/security/request-origin";

const schema = z.object({ idempotencyKey: z.uuid() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { assertTrustedMutation(request); const actor = await requireInternalAccess(); const { id } = await params; const appointment = await cancelAdminAppointment({ appointmentId: z.uuid().parse(id), ...schema.parse(await request.json()), actorId: actor.userId }); return NextResponse.json({ appointment, correlationId: correlationIdFrom(request) }); }
  catch (error) { if (error instanceof UntrustedOriginError) return NextResponse.json({ error: "ORIGEM_NAO_CONFIAVEL", correlationId: correlationIdFrom(request) }, { status: 403 }); if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId: correlationIdFrom(request) }, { status: 400 }); if (error instanceof Error && ["OPERATION_IN_PROGRESS", "RECONCILIATION_REQUIRED", "APPOINTMENT_NOT_AVAILABLE"].includes(error.message)) return NextResponse.json({ error: error.message, correlationId: correlationIdFrom(request) }, { status: 409 }); return adminErrorResponse(request, "admin_appointment_cancel_rejected", error); }
}
