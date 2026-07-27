import { NextResponse } from "next/server";
import { z } from "zod";
import { CalendarUnavailableError } from "@/domain/availability/service";
import { intervalForSlots } from "@/domain/availability/slots";
import { getGoogleCalendarAccessToken } from "@/integrations/google-calendar/auth";
import { requirePatientSession } from "@/lib/auth/patient-guard";
import { createSlotHold } from "@/lib/availability/repository";
import { verifySlotSequenceFresh } from "@/lib/availability/service";
import { correlationIdFrom, log } from "@/lib/observability/logger";
import { assertTrustedMutation, UntrustedOriginError } from "@/lib/security/request-origin";

export const slotHoldBodySchema = z.object({
  professionalId: z.uuid(),
  date: z.iso.date(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  partySize: z.union([z.literal(1), z.literal(2)]).default(1),
});

export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    assertTrustedMutation(request);
    const session = await requirePatientSession();
    const body = slotHoldBodySchema.parse(await request.json());
    const accessToken = await getGoogleCalendarAccessToken();
    if (!await verifySlotSequenceFresh(body.professionalId, body.date, body.time, body.partySize, accessToken)) {
      return NextResponse.json({ error: "SLOT_INDISPONIVEL", correlationId }, { status: 409 });
    }
    const interval = intervalForSlots(body.date, body.time, body.partySize);
    const holdId = await createSlotHold({
      professionalId: body.professionalId, startAt: interval.startAt, endAt: interval.endAt,
      phone: session.phone, sessionId: session.sessionId,
    });
    if (!holdId) return NextResponse.json({ error: "SLOT_INDISPONIVEL", correlationId }, { status: 409 });
    return NextResponse.json({ holdId, expiresInSeconds: 300, correlationId }, { status: 201 });
  } catch (error) {
    log("warn", "slot_hold_rejected", { correlationId, error });
    if (error instanceof UntrustedOriginError) return NextResponse.json({ error: "ORIGEM_NAO_CONFIAVEL", correlationId }, { status: 403 });
    if (error instanceof CalendarUnavailableError) return NextResponse.json({ error: "AGENDA_INDISPONIVEL", correlationId }, { status: 503 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId }, { status: 400 });
    return NextResponse.json({ error: "NAO_AUTORIZADO", correlationId }, { status: 401 });
  }
}
