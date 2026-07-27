import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handoffNotificationMessage, handoffReason, readableBrazilianPhone } from "@/domain/messaging/handoff";

describe("human handoff notifications", () => {
  it("turns the original request into a concise, formatting-safe reason", () => {
    expect(handoffReason("menu.handoff")).toBe("Solicitou falar diretamente com a equipe");
    expect(handoffReason("  *Dor* forte\n desde ontem  ")).toBe("Dor forte desde ontem");
    expect(handoffReason("x".repeat(200))).toHaveLength(120);
  });

  it("formats a scannable alert with name, readable phone and reason", () => {
    expect(readableBrazilianPhone("5513999999999")).toBe("+55 (13) 99999-9999");
    const message = handoffNotificationMessage({ patientName: "Ana Souza", patientPhone: "5513999999999", reason: "Precisa confirmar cobertura" });
    expect(message).toMatch(/Novo pedido de atendimento/);
    expect(message).toMatch(/Nome:\* Ana Souza/);
    expect(message).toMatch(/Telefone:\* \+55 \(13\) 99999-9999/);
    expect(message).toMatch(/Motivo:\* Precisa confirmar cobertura/);
  });

  it("creates the handoff and its outbox event atomically with a stable dedupe key", () => {
    const sql = readFileSync("supabase/migrations/202607270015_handoff_notifications.sql", "utf8").toLowerCase();
    expect(sql).toContain("create or replace function public.enqueue_human_handoff");
    expect(sql).toContain("insert into public.human_handoffs");
    expect(sql).toContain("insert into public.notification_outbox");
    expect(sql).toContain("human_handoff.created:");
    expect(sql).toContain("on conflict (dedupe_key) do nothing");
    expect(sql).toContain("grant execute on function public.enqueue_human_handoff");
  });
});
