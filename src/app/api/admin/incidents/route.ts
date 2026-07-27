import { NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalAccess } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/http";
import { incidentCategories, listOperationalIncidents, openOperationalIncident } from "@/lib/admin/incidents";
import { correlationIdFrom } from "@/lib/observability/logger";
import { assertTrustedMutation, UntrustedOriginError } from "@/lib/security/request-origin";

const createSchema = z.object({ category: z.enum(incidentCategories), summary: z.string().trim().min(1).max(500), correlationId: z.string().min(8).max(80).optional(), appointmentId: z.uuid().optional() });

export async function GET(request: Request) {
  try {
    await requireInternalAccess();
    const limit = z.coerce.number().int().min(1).max(100).parse(new URL(request.url).searchParams.get("limit") ?? "50");
    return NextResponse.json({ incidents: await listOperationalIncidents(limit), correlationId: correlationIdFrom(request) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId: correlationIdFrom(request) }, { status: 400 });
    return adminErrorResponse(request, "admin_incident_list_rejected", error);
  }
}

export async function POST(request: Request) {
  try {
    assertTrustedMutation(request);
    const actor = await requireInternalAccess();
    const incident = await openOperationalIncident({ ...createSchema.parse(await request.json()), actorId: actor.userId });
    return NextResponse.json({ incident, correlationId: correlationIdFrom(request) }, { status: 201 });
  } catch (error) {
    if (error instanceof UntrustedOriginError) return NextResponse.json({ error: "ORIGEM_NAO_CONFIAVEL", correlationId: correlationIdFrom(request) }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId: correlationIdFrom(request) }, { status: 400 });
    return adminErrorResponse(request, "admin_incident_create_rejected", error);
  }
}
