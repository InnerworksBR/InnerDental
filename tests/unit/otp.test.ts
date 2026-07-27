import { describe, expect, it } from "vitest";
import { hashAccessToken } from "@/lib/auth/access-token";
import { issueOtp } from "@/lib/auth/otp";

describe("OTP", () => {
  it("emite seis dígitos, persiste apenas hash e expira em cinco minutos", () => {
    const issued = issueOtp(new Date("2026-07-16T12:00:00.000Z"));
    expect(issued.code).toMatch(/^\d{6}$/);
    expect(issued.codeHash).toBe(hashAccessToken(issued.code));
    expect(issued.expiresAt.toISOString()).toBe("2026-07-16T12:05:00.000Z");
  });
});
