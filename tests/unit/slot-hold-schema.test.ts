import { describe, expect, it } from "vitest";
import { slotHoldBodySchema } from "@/app/api/slot-holds/route";

const payload = {
  professionalId: "9de0527c-7fdc-4a6a-afea-4124eb8a88a2",
  date: "2026-07-23",
};

describe("slot hold request schema", () => {
  it.each(["00:00", "09:00", "23:59"])("accepts a valid time: %s", (time) => {
    expect(slotHoldBodySchema.safeParse({ ...payload, time }).success).toBe(true);
  });

  it.each(["9:00", "24:00", "09:60", "09\\00"])("rejects an invalid time: %s", (time) => {
    expect(slotHoldBodySchema.safeParse({ ...payload, time }).success).toBe(false);
  });

  it("accepts only one or two people", () => {
    expect(slotHoldBodySchema.safeParse({ ...payload, time: "09:00", partySize: 2 }).success).toBe(true);
    expect(slotHoldBodySchema.safeParse({ ...payload, time: "09:00", partySize: 3 }).success).toBe(false);
  });
});
