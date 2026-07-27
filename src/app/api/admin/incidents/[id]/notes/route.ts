import { NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalAccess } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/http";
import { addOperationalIncidentNote, IncidentNotFoundError } from "@/lib/admin/incidents";
import { correlationIdFrom } from "@/lib/observability/logger";
import { assertTrustedMutation, UntrustedOriginError } from "@/lib/security/request-origin";

const bodySchema = z.object({ body: z.string().trim().min(1).max(2000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedMutation(request);
    const actor = await requireInternalAccess();
    const { id } = await params;
    const note = await addOperationalIncidentNote({ incidentId: z.uuid().parse(id), ...bodySchema.parse(await request.json()), actorId: actor.userId });
    return NextResponse.json({ note, correlationId: correlationIdFrom(request) }, { status: 201 });
  } catch (error) {
    if (error instanceof UntrustedOriginError) return NextResponse.json({ error: "ORIGEM_NAO_CONFIAVEL", correlationId: correlationIdFrom(request) }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId: correlationIdFrom(request) }, { status: 400 });
    if (error instanceof IncidentNotFoundError) return NextResponse.json({ error: "INCIDENTE_NAO_ENCONTRADO", correlationId: correlationIdFrom(request) }, { status: 404 });
    return adminErrorResponse(request, "admin_incident_note_rejected", error);
  }
}
