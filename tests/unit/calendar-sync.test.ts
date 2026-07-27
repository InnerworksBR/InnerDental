import { describe, expect, it, vi } from "vitest";
import { syncDirectCalendarAppointments } from "../../worker/calendar-sync.ts";
import type { CalendarEvent, CalendarGateway } from "../../src/integrations/google-calendar/port.ts";

const validEvent: CalendarEvent = {
  id: "event-1", summary: "Ana Souza - 13 99999-9999",
  startAt: "2026-07-28T12:00:00.000Z", endAt: "2026-07-28T12:15:00.000Z",
  allDay: false, blocksTime: true,
};

function dbWith(rpc: ReturnType<typeof vi.fn>) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: [{ id: "professional-1", calendar_id: "calendar-1" }], error: null })),
      })),
    })),
    rpc,
  };
}

function gateway(events: CalendarEvent[]): CalendarGateway {
  return { listEvents: vi.fn(async () => events) } as unknown as CalendarGateway;
}

describe("direct Calendar synchronization", () => {
  it("imports eligible events and reconciles only after all imports succeed", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { status: "imported" }, error: null })
      .mockResolvedValueOnce({ data: 0, error: null });
    const db = dbWith(rpc);
    const result = await syncDirectCalendarAppointments({
      db: db as never,
      getAccessToken: async () => "token",
      now: new Date("2026-07-27T12:00:00.000Z"),
      gatewayFactory: () => gateway([validEvent, { ...validEvent, id: "ignored", summary: "Bloqueio" }]),
    });
    expect(result).toMatchObject({ calendars: 1, imported: 1, ignored: 1, reconciled: 0 });
    expect(rpc).toHaveBeenNthCalledWith(2, "reconcile_direct_calendar_appointments", expect.objectContaining({ p_seen_event_ids: ["event-1"] }));
  });

  it("does not reconcile a calendar after an import failure", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "FAIL" } });
    await expect(syncDirectCalendarAppointments({
      db: dbWith(rpc) as never,
      getAccessToken: async () => "token",
      now: new Date("2026-07-27T12:00:00.000Z"),
      gatewayFactory: () => gateway([validEvent]),
    })).rejects.toThrow("DIRECT_CALENDAR_APPOINTMENT_SYNC_FAILED");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects one calendar assigned to multiple active professionals", async () => {
    const db = {
      from: () => ({ select: () => ({ eq: async () => ({ data: [
        { id: "one", calendar_id: "same" }, { id: "two", calendar_id: "same" },
      ], error: null }) }) }),
      rpc: vi.fn(),
    };
    await expect(syncDirectCalendarAppointments({ db: db as never, getAccessToken: async () => "token" }))
      .rejects.toThrow("DIRECT_CALENDAR_DUPLICATE_ASSIGNMENT");
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
