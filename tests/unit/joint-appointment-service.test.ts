import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifySlotSequenceFresh: vi.fn(),
  consumeSlotHold: vi.fn(),
  getProfessionalCalendar: vi.fn(),
  createEvent: vi.fn(),
  rescheduleEvent: vi.fn(),
  patientForPhone: vi.fn(),
  findOperation: vi.fn(),
  beginOperation: vi.fn(),
  createAppointment: vi.fn(),
  completeOperation: vi.fn(),
  markOperationForReconciliation: vi.fn(),
  requirePatientAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
}));

vi.mock("@/lib/availability/service", () => ({ verifySlotSequenceFresh: mocks.verifySlotSequenceFresh }));
vi.mock("@/lib/availability/repository", () => ({
  consumeSlotHold: mocks.consumeSlotHold,
  getProfessionalCalendar: mocks.getProfessionalCalendar,
}));
vi.mock("@/integrations/google-calendar/http-gateway", () => ({
  GoogleCalendarHttpGateway: class {
    createEvent = mocks.createEvent;
    rescheduleEvent = mocks.rescheduleEvent;
  },
}));
vi.mock("@/lib/appointments/repository", () => ({
  patientForPhone: mocks.patientForPhone,
  findOperation: mocks.findOperation,
  beginOperation: mocks.beginOperation,
  createAppointment: mocks.createAppointment,
  completeOperation: mocks.completeOperation,
  markOperationForReconciliation: mocks.markOperationForReconciliation,
  requirePatientAppointment: mocks.requirePatientAppointment,
  rescheduleAppointment: mocks.rescheduleAppointment,
  cancelAppointment: vi.fn(),
  listPatientAppointments: vi.fn(),
}));

import { createPatientAppointment, reschedulePatientAppointment } from "@/lib/appointments/service";

const common = {
  phone: "5513999999999",
  sessionId: "04e2cdd5-b1f7-49a0-b7d1-7af9a31ebdda",
  holdId: "21b50505-e557-42c1-a5b8-80097fc5019e",
  professionalId: "9de0527c-7fdc-4a6a-afea-4124eb8a88a2",
  date: "2026-07-30",
  time: "09:00",
  idempotencyKey: "d5b4b73c-7b25-4af3-83ac-cdc3a710d194",
  token: "token",
};

describe("joint appointment service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySlotSequenceFresh.mockResolvedValue(true);
    mocks.consumeSlotHold.mockResolvedValue(true);
    mocks.getProfessionalCalendar.mockResolvedValue("calendar@example.com");
    mocks.patientForPhone.mockResolvedValue({ id: "patient", name: "Ana", insurance_plan_id: "plan" });
    mocks.findOperation.mockResolvedValue(null);
    mocks.createEvent.mockResolvedValue("calendar-event");
    mocks.createAppointment.mockResolvedValue({ id: "appointment", start_at: "2026-07-30T12:00:00.000Z", end_at: "2026-07-30T12:30:00.000Z" });
  });

  it("protects 30 minutes and sends the companion only to Calendar", async () => {
    await createPatientAppointment({ ...common, patientName: "Ana", companionName: "Bia", partySize: 2, insurancePlanId: "plan" });

    expect(mocks.verifySlotSequenceFresh).toHaveBeenCalledWith(common.professionalId, common.date, common.time, 2, common.token);
    expect(mocks.consumeSlotHold).toHaveBeenCalledWith(expect.objectContaining({
      startAt: "2026-07-30T12:00:00.000Z",
      endAt: "2026-07-30T12:30:00.000Z",
    }));
    expect(mocks.createEvent).toHaveBeenCalledWith("calendar@example.com", expect.objectContaining({ summary: "Ana e Bia 5513999999999" }));
    expect(mocks.patientForPhone).toHaveBeenCalledWith(common.phone, "Ana", "plan");
    expect(JSON.stringify(mocks.createAppointment.mock.calls)).not.toContain("Bia");
    expect(JSON.stringify(mocks.beginOperation.mock.calls)).not.toContain("Bia");
  });

  it("preserves a 30 minute duration and Calendar title when rescheduling", async () => {
    mocks.requirePatientAppointment.mockResolvedValue({
      id: "appointment",
      patient_id: "patient",
      professional_id: common.professionalId,
      start_at: "2026-07-30T12:00:00.000Z",
      end_at: "2026-07-30T12:30:00.000Z",
      status: "scheduled",
      calendar_event_id: "calendar-event",
    });
    mocks.rescheduleAppointment.mockResolvedValue({ id: "appointment" });

    await reschedulePatientAppointment({ ...common, appointmentId: "appointment" });

    expect(mocks.verifySlotSequenceFresh).toHaveBeenCalledWith(common.professionalId, common.date, common.time, 2, common.token);
    expect(mocks.rescheduleEvent).toHaveBeenCalledWith("calendar@example.com", "calendar-event", {
      startAt: "2026-07-30T12:00:00.000Z",
      endAt: "2026-07-30T12:30:00.000Z",
    });
  });
});
