import { describe, expect, it } from "vitest";
import { redactPhoneForAudit } from "@/lib/auth/audit";

describe("auditoria de autenticação", () => {
  it("gera identificador estável sem expor o telefone", () => {
    const value = redactPhoneForAudit("5513991743380");
    expect(value).toHaveLength(12);
    expect(value).not.toContain("5513991743380");
  });
});
