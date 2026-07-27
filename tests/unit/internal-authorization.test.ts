import { describe, expect, it } from "vitest";
import { assertInternalProfile, InternalAccessError } from "@/lib/admin/authorization";

describe("internal authorization", () => {
  it("accepts active owners and operators for operational access", () => {
    expect(assertInternalProfile({ userId: "user", role: "owner", active: true }).role).toBe("owner");
    expect(assertInternalProfile({ userId: "user", role: "operator", active: true }).role).toBe("operator");
  });

  it("requires an active profile", () => {
    expect(() => assertInternalProfile(null)).toThrow(InternalAccessError);
    expect(() => assertInternalProfile({ userId: "user", role: "owner", active: false })).toThrow("INTERNAL_UNAUTHORIZED");
  });

  it("reserves access management for owners", () => {
    expect(assertInternalProfile({ userId: "user", role: "owner", active: true }, "owner").role).toBe("owner");
    expect(() => assertInternalProfile({ userId: "user", role: "operator", active: true }, "owner"))
      .toThrow("INTERNAL_FORBIDDEN");
  });
});
