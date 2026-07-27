import { describe, expect, it } from "vitest";
import { AppointmentPolicyError, calendarEventPayload, ensureFutureCancellation } from "@/domain/appointments/service";
describe("appointments", () => {
  it("applies cancellation notice", () => {
    expect(() => ensureFutureCancellation("2026-07-17T12:00:00Z", new Date("2026-07-16T13:00:00Z"))).toThrow(AppointmentPolicyError);
  });

  it("builds Calendar titles in the clinic pattern", () => {
    const base = { appointmentId: "id", patientName: "Ana", phone: "5511999999999", interval: { startAt: "2026-07-20T12:00:00Z", endAt: "2026-07-20T12:15:00Z" } };
    expect(calendarEventPayload(base).summary).toBe("Ana 5511999999999");
    expect(calendarEventPayload({ ...base, companionName: "Bia" }).summary).toBe("Ana e Bia 5511999999999");
  });
});
