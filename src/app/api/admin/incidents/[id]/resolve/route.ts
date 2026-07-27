import { NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalAccess } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/http";
import { IncidentNotFoundError, IncidentStateError, resolveOperationalIncident } from "@/lib/admin/incidents";
import { correlationIdFrom } from "@/lib/observability/logger";
import { assertTrustedMutation, UntrustedOriginError } from "@/lib/security/request-origin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedMutation(request);
    const actor = await requireInternalAccess();
    const { id } = await params;
    const incident = await resolveOperationalIncident({ incidentId: z.uuid().parse(id), actorId: actor.userId });
    return NextResponse.json({ incident, correlationId: correlationIdFrom(request) });
  } catch (error) {
    if (error instanceof UntrustedOriginError) return NextResponse.json({ error: "ORIGEM_NAO_CONFIAVEL", correlationId: correlationIdFrom(request) }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId: correlationIdFrom(request) }, { status: 400 });
    if (error instanceof IncidentNotFoundError) return NextResponse.json({ error: "INCIDENTE_NAO_ENCONTRADO", correlationId: correlationIdFrom(request) }, { status: 404 });
    if (error instanceof IncidentStateError) return NextResponse.json({ error: "INCIDENTE_JA_ENCERRADO", correlationId: correlationIdFrom(request) }, { status: 409 });
    return adminErrorResponse(request, "admin_incident_resolve_rejected", error);
  }
}
