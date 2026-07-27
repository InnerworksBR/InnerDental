import { describe, expect, it } from "vitest";
import { maskPhone, projectAppointment, projectCalendarEvent, projectDirectCalendarEvents, sanitizeCalendarEventTitle } from "@/lib/admin/repository";

describe("admin projections", () => {
  it("masks phone numbers in operational lists", () => {
    expect(maskPhone("5511999999999")).toBe("•••••••••9999");
  });

  it("projects the authorized agenda label while keeping the masked list value", () => {
    const appointment = projectAppointment({
      id: "appointment", start_at: "2026-07-17T12:00:00Z", end_at: "2026-07-17T12:15:00Z", status: "scheduled", source: "portal", calendar_event_id: "event",
      patients: { name: "Ana", phone: "5511999999999" }, professionals: { name: "Dra. Priscila" },
    });

    expect(appointment).toMatchObject({ patientName: "Ana", agendaLabel: "Ana 5511999999999", maskedPhone: "•••••••••9999", professionalName: "Dra. Priscila" });
  });

  it("projects direct Calendar events and masks phone-like values in their titles", () => {
    const event = projectCalendarEvent({
      id: "google-event",
      summary: "Ana | +55 (11) 99999-9999",
      startAt: "2026-07-17T12:00:00Z",
      endAt: "2026-07-17T12:15:00Z",
      allDay: false,
      blocksTime: true,
    }, { id: "professional", name: "Dra. Priscila" });

    expect(event).toMatchObject({
      id: "google-calendar:professional:google-event",
      title: "Ana | •••••••••9999",
      professionalName: "Dra. Priscila",
      source: "google_calendar",
    });
    expect(sanitizeCalendarEventTitle(null)).toBe("Evento no Google Calendar");
    expect(JSON.stringify(event)).not.toContain("99999-9999");
  });

  it("does not duplicate Calendar events already linked to internal records", () => {
    const base = {
      summary: "Consulta",
      startAt: "2026-07-17T12:00:00Z",
      endAt: "2026-07-17T12:15:00Z",
      allDay: false,
      blocksTime: true,
    };
    const events = projectDirectCalendarEvents(
      [{ ...base, id: "linked" }, { ...base, id: "direct" }],
      { id: "professional", name: "Dra. Priscila" },
      new Set(["linked"]),
    );

    expect(events).toHaveLength(1);
    expect(events[0].calendarEventId).toBe("direct");
  });
});
