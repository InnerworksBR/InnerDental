import { NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalAccess } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/http";
import { listAdminActivity } from "@/lib/admin/repository";
import { correlationIdFrom } from "@/lib/observability/logger";

export async function GET(request: Request) {
  try {
    await requireInternalAccess();
    const limit = z.coerce.number().int().min(1).max(100).parse(new URL(request.url).searchParams.get("limit") ?? "30");
    return NextResponse.json({ ...(await listAdminActivity(limit)), correlationId: correlationIdFrom(request) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId: correlationIdFrom(request) }, { status: 400 });
    return adminErrorResponse(request, "admin_activity_rejected", error);
  }
}
