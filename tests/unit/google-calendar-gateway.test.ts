import { describe, expect, it, vi } from "vitest";
import { CalendarUnavailableError } from "@/domain/availability/service";
import { GoogleCalendarHttpGateway } from "@/integrations/google-calendar/http-gateway";

const range = { startAt: "2026-07-20T03:00:00.000Z", endAt: "2026-07-21T03:00:00.000Z" };

describe("GoogleCalendarHttpGateway", () => {
  it("paginates and normalizes timed and all-day events", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "timed", start: { dateTime: "2026-07-20T10:10:00-03:00" }, end: { dateTime: "2026-07-20T10:40:00-03:00" } }], nextPageToken: "next" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "all-day", start: { date: "2026-07-21" }, end: { date: "2026-07-22" } }] }), { status: 200 }));
    const gateway = new GoogleCalendarHttpGateway("secret", fetcher, 100);
    const events = await gateway.listBusyIntervals("calendar@example.com", range);
    expect(events).toEqual([
      { startAt: "2026-07-20T13:10:00.000Z", endAt: "2026-07-20T13:40:00.000Z" },
      { startAt: "2026-07-21T03:00:00.000Z", endAt: "2026-07-22T03:00:00.000Z" },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain("pageToken=next");
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({ Authorization: "Bearer secret" });
  });

  it("preserves event identity for the admin view and ignores transparent events as busy", async () => {
    const body = JSON.stringify({ items: [
      { id: "direct", summary: "Consulta Ana", start: { dateTime: "2026-07-20T10:00:00-03:00" }, end: { dateTime: "2026-07-20T10:15:00-03:00" } },
      { id: "free", summary: "Lembrete", transparency: "transparent", start: { dateTime: "2026-07-20T11:00:00-03:00" }, end: { dateTime: "2026-07-20T11:15:00-03:00" } },
      { id: "cancelled", status: "cancelled", start: { dateTime: "2026-07-20T12:00:00-03:00" }, end: { dateTime: "2026-07-20T12:15:00-03:00" } },
    ] });
    const fetcher = vi.fn().mockImplementation(async () => new Response(body, { status: 200 }));
    const gateway = new GoogleCalendarHttpGateway("secret", fetcher, 100);

    await expect(gateway.listEvents("calendar", range)).resolves.toMatchObject([
      { id: "direct", summary: "Consulta Ana", allDay: false, blocksTime: true },
      { id: "free", summary: "Lembrete", allDay: false, blocksTime: false },
    ]);

    const busyGateway = new GoogleCalendarHttpGateway("secret", fetcher, 100);
    await expect(busyGateway.listBusyIntervals("calendar", range)).resolves.toHaveLength(1);
  });

  it("closes availability when the provider fails", async () => {
    const gateway = new GoogleCalendarHttpGateway("secret", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(gateway.listBusyIntervals("calendar", range)).rejects.toBeInstanceOf(CalendarUnavailableError);
  });

  it("reschedules with PATCH and preserves the existing title", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "event" }), { status: 200 }));
    const gateway = new GoogleCalendarHttpGateway("secret", fetcher, 100);
    await gateway.rescheduleEvent("calendar", "event", {
      startAt: "2026-07-20T12:00:00.000Z",
      endAt: "2026-07-20T12:30:00.000Z",
    });

    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/events/event"), expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({
        start: { dateTime: "2026-07-20T12:00:00.000Z", timeZone: "America/Sao_Paulo" },
        end: { dateTime: "2026-07-20T12:30:00.000Z", timeZone: "America/Sao_Paulo" },
      }),
    }));
    expect(fetcher.mock.calls[0][1]?.body).not.toContain("summary");
  });
});
