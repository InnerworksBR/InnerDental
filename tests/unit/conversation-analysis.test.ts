import { describe, expect, it } from "vitest";

import { phoneHash } from "../../src/domain/conversation-analysis/hash";
import { maskConversationForLlm } from "../../src/domain/conversation-analysis/mask";

describe("conversation-analysis / mask", () => {
  it("masks telefone completo and removes chaves de nome", () => {
    const masked = maskConversationForLlm([
      { role: "user", text: "Olá, meu telefone é 11999998888", name: "Maria Silva", phone: "5511999998888" },
    ]);
    const serialized = JSON.stringify(masked);
    expect(serialized).not.toContain("11999998888");
    expect(serialized).not.toContain("Maria Silva");
    expect(serialized).not.toContain("name");
    expect(serialized).not.toContain("phone");
    expect(serialized).toContain("[PHONE]");
  });

  it("preserva campos permitidos e trunca texto grande", () => {
    const masked = maskConversationForLlm([
      {
        role: "bot",
        text: "x".repeat(1200),
        intent: "schedule",
        action: "portal_link",
        lastError: null,
        correlationId: "abc",
      },
    ]);
    expect(masked[0].text.length).toBe(600);
    expect(masked[0].intent).toBe("schedule");
    expect(masked[0].correlationId).toBe("abc");
  });
});

describe("conversation-analysis / hash", () => {
  it("produz hash determinístico de 16 caracteres hex", () => {
    const hash1 = phoneHash("5511999998888");
    const hash2 = phoneHash("5511999998888");
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{16}$/);
  });

  it("hashes diferentes para telefones diferentes", () => {
    expect(phoneHash("5511999998888")).not.toBe(phoneHash("5511988887777"));
  });
});
