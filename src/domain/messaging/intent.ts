export type MessageIntent = "schedule" | "reschedule" | "cancel" | "confirm" | "insurance" | "procedure" | "faq" | "greeting" | "human";
function normalized(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
export function isExplicitHumanRequest(message: string): boolean {
  const text = normalized(message);
  if (text === "menu.handoff") return true;
  const mentionsPerson = /\b(doutora|dentista|atendente|humano|pessoa|alguem|equipe)\b/.test(text);
  const asksForContact = /\b(falar|conversar|chamar|transferir|encaminhar|quero|preciso|gostaria)\b/.test(text);
  return mentionsPerson && asksForContact;
}
export function classifyIntent(message: string): MessageIntent {
  const text = normalized(message);
  if (text === "menu.agenda") return "schedule";
  if (text === "menu.insurance") return "insurance";
  if (text === "menu.procedures") return "procedure";
  if (["menu.questions", "menu.unsupported_media"].includes(text)) return "faq";
  if (text === "menu.handoff") return "human";
  if (text === "appointment.confirm") return "confirm";
  if (/^(oi|ola|bom dia|boa tarde|boa noite|tudo bem|obrigad[oa]|obg)[!,. ]*$/.test(text)) return "greeting";
  if (/\b(remarcar|reagendar|mudar.*horario)\b/.test(text)) return "reschedule";
  if (/\b(cancelar|desmarcar)\b/.test(text)) return "cancel";
  if (/\b(confirmo|confirmar(?: minha)? presenca|vou comparecer|estarei presente)\b/.test(text)) return "confirm";
  if (/\b(marcar|agendar|consulta|horario)\b/.test(text)) return "schedule";
  if (/\b(plano|convenio|aceit\w*|cobertura)\b/.test(text)) return "insurance";
  if (/\b(procedimento|tratamento|limpeza|clareamento|canal|implante)\b/.test(text)) return "procedure";
  if (/\b(como|quando|onde|duvida|pergunta)\b/.test(text)) return "faq";
  return "human";
}
