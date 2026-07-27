import { NextResponse } from "next/server";
import { z } from "zod";
import { CalendarUnavailableError } from "@/domain/availability/service";
import { withConsecutiveSlots } from "@/domain/availability/slots";
import { getGoogleCalendarAccessToken } from "@/integrations/google-calendar/auth";
import { requirePatientSession } from "@/lib/auth/patient-guard";
import { getAvailability, getAvailabilityWindow } from "@/lib/availability/service";

const querySchema = z.object({ professionalId: z.uuid(), date: z.iso.date() });
const windowQuerySchema = z.object({
  professionalId: z.uuid(),
  dates: z.string().transform((value) => value.split(",")).pipe(z.array(z.iso.date()).min(1).max(30)),
  partySize: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2)])).default(1),
});

export async function GET(request: Request) {
  const correlationId = crypto.randomUUID();
  try {
    await requirePatientSession();
    const rawQuery = Object.fromEntries(new URL(request.url).searchParams);
    if (rawQuery.dates) {
      const query = windowQuerySchema.parse(rawQuery);
      const accessToken = await getGoogleCalendarAccessToken();
      const days = (await getAvailabilityWindow(query.professionalId, query.dates, accessToken))
        .filter((day) => withConsecutiveSlots(day.slots, query.partySize).length > 0)
        .slice(0, 6);
      return NextResponse.json({ days, correlationId });
    }
    const query = querySchema.parse(rawQuery);
    const accessToken = await getGoogleCalendarAccessToken();
    const slots = await getAvailability(query.professionalId, query.date, accessToken);
    return NextResponse.json({ slots, correlationId });
  } catch (error) {
    if (error instanceof CalendarUnavailableError) return NextResponse.json({ error: "AGENDA_INDISPONIVEL", correlationId }, { status: 503 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "REQUISICAO_INVALIDA", correlationId }, { status: 400 });
    return NextResponse.json({ error: "NAO_AUTORIZADO", correlationId }, { status: 401 });
  }
}
