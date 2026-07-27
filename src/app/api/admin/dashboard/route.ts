import { NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalAccess } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/http";
import { listAdminActivity, listAdminAgenda, listAdminProfessionals } from "@/lib/admin/repository";
import { correlationIdFrom } from "@/lib/observability/logger";

export async function GET(request: Request) {
  try {
    await requireInternalAccess();
    const date = z.iso.date().parse(new URL(request.url).searchParams.get("date") ?? new Date().toISOString().slice(0, 10));
    const [agenda, activity, professionals] = await Promise.all([listAdminAgenda(date), listAdminActivity(20), listAdminProfessionals()]);
    return NextResponse.json({ date, agenda, activity, professionals, correlationId: correlationIdFrom(request) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId: correlationIdFrom(request) }, { status: 400 });
    return adminErrorResponse(request, "admin_dashboard_rejected", error);
  }
}
