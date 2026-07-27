import { NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalAccess } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/http";
import { listAdminAgenda } from "@/lib/admin/repository";
import { correlationIdFrom } from "@/lib/observability/logger";

export async function GET(request: Request) {
  try {
    await requireInternalAccess();
    const date = z.iso.date().parse(new URL(request.url).searchParams.get("date") ?? "");
    return NextResponse.json({ ...(await listAdminAgenda(date)), correlationId: correlationIdFrom(request) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId: correlationIdFrom(request) }, { status: 400 });
    return adminErrorResponse(request, "admin_agenda_rejected", error);
  }
}
