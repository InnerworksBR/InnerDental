import { NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalAccess } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/http";
import { listAdminActivity, listAdminActivitySince } from "@/lib/admin/repository";
import { correlationIdFrom } from "@/lib/observability/logger";

export async function GET(request: Request) {
  try {
    await requireInternalAccess();
    const url = new URL(request.url);
    const since = url.searchParams.get("since");
    const limit = z.coerce.number().int().min(1).max(100).parse(url.searchParams.get("limit") ?? "30");
    if (since) {
      const parsed = z.string().datetime({ offset: true }).safeParse(since);
      if (!parsed.success) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId: correlationIdFrom(request) }, { status: 400 });
      return NextResponse.json({ ...(await listAdminActivitySince(parsed.data, limit)), correlationId: correlationIdFrom(request) });
    }
    return NextResponse.json({ ...(await listAdminActivity(limit)), correlationId: correlationIdFrom(request) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId: correlationIdFrom(request) }, { status: 400 });
    return adminErrorResponse(request, "admin_activity_rejected", error);
  }
}
