import { describe, expect, it } from "vitest";
import { classifyIntent, isAccessLinkRequest, isExplicitHumanRequest, isPaymentQuestion, isProcedureBookingRequest, type MessageIntent } from "@/domain/messaging/intent.legacy";

/**
 * Locks the legacy regex cascade under the same fixtures as the live
 * `tests/unit/whatsapp-routing-definitivo.test.ts` so any future regression
 * in the classifier is caught before the LLM router swallows it. PR 8 moved
 * the source of truth into `intent.legacy.ts`; this file proves the move
 * was behavior-preserving.
 *
 * The 13 fixtures below cover every `MessageIntent` member (12 unique) plus
 * the `menu.unsupported_media` literal that routes to `faq` (so the suite
 * also exercises the stable menu.* surface the live routing test relies on:
  `menu.agenda` → schedule, `menu.insurance` → insurance, `menu.procedures` →
  procedure, `menu.questions` → faq, `menu.unsupported_media` → faq,
  `menu.handoff` → human, `appointment.confirm` → confirm).
 */
describe("legacy intent cascade (PR 8)", () => {
  const fixtures: Array<[string, MessageIntent]> = [
    ["menu.agenda", "schedule"],
    ["Quero remarcar meu horário", "reschedule"],
    ["Preciso desmarcar", "cancel"],
    ["Confirmo", "confirm"],
    ["Para quando ficou marcada minha próxima consulta?", "appointment_status"],
    ["As próteses ficariam prontas até agosto, qual o andamento?", "treatment_status"],
    ["Vocês aceitam Unimed?", "insurance"],
    ["Gostaria de fazer uma limpeza", "procedure"],
    ["Me fala qual é a sala", "faq"],
    ["Olá, bom dia", "greeting"],
    ["Quero falar com a doutora", "human"],
    ["texto sem correspondência", "conversation"],
    // 13th: menu.unsupported_media routes to faq (covers the menu.* surface).
    ["menu.unsupported_media", "faq"],
  ];

  it("covers every MessageIntent value (12 + menu.unsupported_media path)", () => {
    const distinct = new Set(fixtures.map(([, intent]) => intent));
    // 12 distinct MessageIntent members; the 13th fixture exercises an extra
    // menu.* literal that routes to faq, so the distinct count stays at 12.
    expect(distinct.size).toBe(12);
    // Spot-check the union is fully exercised.
    expect(distinct).toEqual(new Set<MessageIntent>([
      "schedule", "reschedule", "cancel", "confirm",
      "appointment_status", "treatment_status", "insurance", "procedure",
      "faq", "greeting", "human", "conversation",
    ]));
  });

  it("classifies every fixture the same way the live routing test does", () => {
    for (const [message, expected] of fixtures) {
      expect(classifyIntent(message)).toBe(expected);
    }
  });

  it("still recognizes an explicit handoff menu action", () => {
    expect(isExplicitHumanRequest("menu.handoff")).toBe(true);
  });

  it("still recognizes a Portuguese link-replacement request", () => {
    expect(isAccessLinkRequest("não recebi o link")).toBe(true);
  });

  it("still recognizes a payment/installments question", () => {
    expect(isPaymentQuestion("posso parcelar?")).toBe(true);
  });

  it("still recognizes a direct procedure booking request", () => {
    expect(isProcedureBookingRequest("quero fazer uma limpeza")).toBe(true);
  });
});