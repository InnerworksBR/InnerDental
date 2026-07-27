import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { patientAppointmentSchema } from "@/app/api/appointments/route";

const base = {
  professionalId: "9de0527c-7fdc-4a6a-afea-4124eb8a88a2",
  holdId: "b06bd15f-99f4-4286-88a4-ecb526f25df5",
  date: "2026-07-30",
  time: "09:00",
  idempotencyKey: "77381bcf-c78b-4bbd-8dfc-f13aaff10129",
};

describe("joint appointment contract", () => {
  it("requires the second name only for a two-person booking", () => {
    expect(patientAppointmentSchema.parse(base).partySize).toBe(1);
    expect(patientAppointmentSchema.safeParse({ ...base, partySize: 2 }).success).toBe(false);
    expect(patientAppointmentSchema.safeParse({ ...base, partySize: 2, companionName: "Bia" }).success).toBe(true);
  });

  it("does not add companion persistence to Supabase migrations or repositories", () => {
    const persistence = [
      readFileSync("supabase/migrations/202607270013_joint_appointments.sql", "utf8"),
      readFileSync("src/lib/appointments/repository.ts", "utf8"),
    ].join("\n");
    expect(persistence).not.toMatch(/companion[_ ]?name/i);
  });
});
