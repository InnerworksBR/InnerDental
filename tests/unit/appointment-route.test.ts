import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  patientProfile: vi.fn(),
  createAppointment: vi.fn(),
  planLookup: vi.fn(),
  trustedMutation: vi.fn(),
  patientSession: vi.fn(),
  calendarToken: vi.fn(),
  log: vi.fn(),
}));

vi.mock("@/domain/availability/service", () => ({
  CalendarUnavailableError: class CalendarUnavailableError extends Error {},
}));
vi.mock("@/integrations/google-calendar/auth", () => ({ getGoogleCalendarAccessToken: mocks.calendarToken }));
vi.mock("@/lib/auth/patient-guard", () => ({ requirePatientSession: mocks.patientSession }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.planLookup }) }) }) }),
  }),
}));
vi.mock("@/lib/appointments/service", () => ({
  createPatientAppointment: mocks.createAppointment,
  listReconciledPatientAppointments: vi.fn(),
}));
vi.mock("@/lib/appointments/repository", () => ({ patientProfileForPhone: mocks.patientProfile }));
vi.mock("@/lib/observability/logger", () => ({ correlationIdFrom: () => "correlation-id", log: mocks.log }));
vi.mock("@/lib/security/request-origin", () => ({
  assertTrustedMutation: mocks.trustedMutation,
  UntrustedOriginError: class UntrustedOriginError extends Error {},
}));

import { POST } from "@/app/api/appointments/route";

const requestBody = {
  professionalId: "9de0527c-7fdc-4a6a-afea-4124eb8a88a2",
  holdId: "b06bd15f-99f4-4286-88a4-ecb526f25df5",
  date: "2026-07-30",
  time: "09:00",
  idempotencyKey: "77381bcf-c78b-4bbd-8dfc-f13aaff10129",
};

describe("POST /api/appointments", () => {
  beforeEach(() => {
    mocks.patientSession.mockResolvedValue({ phone: "5513999999999", sessionId: "patient-session" });
    mocks.calendarToken.mockResolvedValue("calendar-token");
    mocks.planLookup.mockResolvedValue({ data: { id: "particular-plan" }, error: null });
    mocks.createAppointment.mockResolvedValue({ id: "appointment-id" });
    mocks.trustedMutation.mockReset();
  });

  it("uses the persisted Particular plan when the portal only needs the patient's name", async () => {
    mocks.patientProfile.mockResolvedValue({ complete: false, name: null, insurancePlanId: "particular-plan" });

    const response = await POST(new Request("https://agenda.example/api/appointments", {
      method: "POST",
      body: JSON.stringify({ ...requestBody, patientName: "Ana Souza" }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createAppointment).toHaveBeenCalledWith(expect.objectContaining({
      patientName: "Ana Souza",
      insurancePlanId: "particular-plan",
    }));
  });

  it("does not replace an existing persisted plan with a client-supplied value", async () => {
    mocks.patientProfile.mockResolvedValue({ complete: true, name: "Ana Souza", insurancePlanId: "particular-plan" });

    const response = await POST(new Request("https://agenda.example/api/appointments", {
      method: "POST",
      body: JSON.stringify({ ...requestBody, insurancePlanId: "3d3ca167-6f17-47e1-a5d2-992a7d47ca48" }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createAppointment).toHaveBeenCalledWith(expect.objectContaining({
      patientName: "Ana Souza",
      insurancePlanId: "particular-plan",
    }));
  });
});
