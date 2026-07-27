import { NextResponse } from "next/server";
import { z } from "zod";
import { managementCommandSchema } from "@/domain/admin/management";
import { requireInternalAccess, requireInternalOwner } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/http";
import { executeManagementCommand, listManagementSnapshot, ManagementConflictError } from "@/lib/admin/management";
import { correlationIdFrom } from "@/lib/observability/logger";
import { assertTrustedMutation, UntrustedOriginError } from "@/lib/security/request-origin";

export async function GET(request: Request) {
  try {
    const actor = await requireInternalAccess();
    const patientSearch = z.string().trim().max(80).parse(new URL(request.url).searchParams.get("patientSearch") ?? "");
    return NextResponse.json({ management: await listManagementSnapshot(patientSearch), canManage: actor.role === "owner", correlationId: correlationIdFrom(request) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId: correlationIdFrom(request) }, { status: 400 });
    return adminErrorResponse(request, "admin_management_list_rejected", error);
  }
}

export async function POST(request: Request) {
  try {
    assertTrustedMutation(request);
    const command = managementCommandSchema.parse(await request.json());
    const actor = command.action === "save_patient" ? await requireInternalAccess() : await requireInternalOwner();
    const result = await executeManagementCommand(command, actor);
    return NextResponse.json({ result, correlationId: correlationIdFrom(request) });
  } catch (error) {
    const correlationId = correlationIdFrom(request);
    if (error instanceof UntrustedOriginError) return NextResponse.json({ error: "ORIGEM_NAO_CONFIAVEL", correlationId }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })), correlationId }, { status: 400 });
    if (error instanceof ManagementConflictError) return NextResponse.json({ error: error.code, correlationId }, { status: 409 });
    return adminErrorResponse(request, "admin_management_command_rejected", error);
  }
}
