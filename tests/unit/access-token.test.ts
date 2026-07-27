import { describe, expect, it } from "vitest";
import { hashAccessToken, issueAccessToken } from "@/lib/auth/access-token";

describe("access token opaco", () => {
  it("emite token não vazio, hash determinístico e expiração de cinco minutos", () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const issued = issueAccessToken(now);

    expect(issued.token).not.toBe(issued.tokenHash);
    expect(issued.tokenHash).toBe(hashAccessToken(issued.token));
    expect(issued.tokenHash).toHaveLength(64);
    expect(issued.expiresAt.toISOString()).toBe("2026-07-16T12:05:00.000Z");
  });
});
