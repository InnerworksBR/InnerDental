import { NextResponse } from "next/server";
import { z } from "zod";

import { requireInternalAccess } from "@/lib/admin/authorization";
import { adminErrorResponse } from "@/lib/admin/http";
import { correlationIdFrom } from "@/lib/observability/logger";
import {
  analyzeConversation,
  getRecentAnalysis,
  markResolved,
  WindowSchema,
} from "@/domain/conversation-analysis/service";

const PostBody = z.object({
  conversationKey: z.string().min(1).max(64).optional(),
  window: WindowSchema,
  messages: z.array(z.object({
    role: z.enum(["user", "bot", "system"]).optional(),
    text: z.string().max(2000).optional(),
    intent: z.string().max(64).nullable().optional(),
    action: z.string().max(64).nullable().optional(),
    lastError: z.string().max(500).nullable().optional(),
    correlationId: z.string().max(80).nullable().optional(),
  })).min(1).max(40),
  intent: z.string().max(64).nullable().optional(),
  action: z.string().max(64).nullable().optional(),
  lastError: z.string().max(500).nullable().optional(),
  correlationIds: z.array(z.string().max(80)).max(20).optional(),
});

const PatchBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) });

export async function GET(request: Request) {
  try {
    const profile = await requireInternalAccess();
    const url = new URL(request.url);
    const window = WindowSchema.parse(url.searchParams.get("window") ?? "24h");
    const aggregated = await getRecentAnalysis(window);
    return NextResponse.json({ ...aggregated, correlationId: correlationIdFrom(request), actor: profile.role });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId: correlationIdFrom(request) }, { status: 400 });
    return adminErrorResponse(request, "admin_conversation_analysis_get_rejected", error);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requireInternalAccess();
    const body = PostBody.parse(await request.json());
    const result = await analyzeConversation({
      conversationKey: body.conversationKey,
      window: body.window,
      messages: body.messages,
      intent: body.intent,
      action: body.action,
      lastError: body.lastError,
      correlationIds: body.correlationIds,
      actorId: profile.userId ?? null,
    });
    return NextResponse.json({ log: result.log, correlationId: correlationIdFrom(request) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId: correlationIdFrom(request) }, { status: 400 });
    return adminErrorResponse(request, "admin_conversation_analysis_post_rejected", error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireInternalAccess();
    const body = PatchBody.parse(await request.json());
    await markResolved(body.ids);
    return NextResponse.json({ ok: true, correlationId: correlationIdFrom(request) });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId: correlationIdFrom(request) }, { status: 400 });
    return adminErrorResponse(request, "admin_conversation_analysis_patch_rejected", error);
  }
}
