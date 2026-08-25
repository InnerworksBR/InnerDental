/**
 * @deprecated This module is the legacy regex-based intent classifier.
 * It is preserved only as the deterministic fallback for the LLM router
 * (`src/domain/messaging/router-tools.ts`). New code should not import
 * from this module. The fallback path will be removed in a future major
 * release once the LLM router has been the sole routing source in
 * production for >= 60 days.
 */

export type MessageIntent = "schedule" | "reschedule" | "cancel" | "confirm" | "appointment_status" | "treatment_status" | "insurance" | "procedure" | "faq" | "greeting" | "human" | "conversation";
function normalized(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
export function isExplicitHumanRequest(message: string): boolean {
  const text = normalized(message);
  if (text === "menu.handoff") return true;
  const mentionsPerson = /\b(doutora|dentista|atendente|humano|pessoa|alguem|equipe)\b/.test(text);
  const asksForContact = /\b(falar|conversar|chamar|transferir|encaminhar|quero|preciso|gostaria)\b/.test(text);
  return mentionsPerson && asksForContact;
}
export function isClinicalQuestion(message: string): boolean {
  const text = normalized(message);
  if (/\b(dor|doendo|inchaco|inchado|sangramento|sangrando|febre|pus|infeccao|trauma|alergia|urgencia|emergencia|pos operatorio|pos operatoria|complicacao|receita|prescricao|remedio|medicamento|antibiotico|analgesico|diagnostico|laudo|contraindicacao)\b/.test(text)) return true;
  const asksForClinicalAdvice = /\b(devo|posso|pode|melhor|indica|recomenda|preciso)\b/.test(text);
  const mentionsTreatmentDecision = /\b(tratamento|procedimento|extracao|extrair|implante|canal|cirurgia|dente)\b/.test(text);
  return asksForClinicalAdvice && mentionsTreatmentDecision;
}
export function isProcedureBookingRequest(message: string): boolean {
  const text = normalized(message);
  const asksToBook = /\b(marcar|marca|marque|agendar|agenda|agende)\b/.test(text);
  const wantsProcedure = /\b(quero|queria|gostaria|desejo|pretendo|preciso|poderia)\b/.test(text)
    && /\b(fazer|realizar)\b/.test(text);
  return asksToBook || wantsProcedure;
}
export function isPaymentQuestion(message: string): boolean {
  return /\b(pagamento|pagar|cartao|credito|debito|pix|parcelar)\b/.test(normalized(message));
}
export function isAccessLinkRequest(message: string): boolean {
  const text = normalized(message);
  const mentionsAccess = /\b(link|acesso|agenda)\b/.test(text);
  const asksForAnother = /\b(perdi|perdeu|perdemos|nao (?:possuo|tenho|recebi|abre|funciona)|nao recebi|venceu|expirou|mand[ae]|mandar|envi[ae]|enviar|pass[ae]|passar|quero|gostaria|preciso|pode|novo|novamente|de novo|qual|cad[eê]|onde esta)\b/.test(text);
  return mentionsAccess && asksForAnother;
}
export function isGreetingMessage(message: string): boolean {
  const text = normalized(message);
  const withoutGreetings = text
    .replace(/\b(oi|ola|bom dia|boa tarde|boa noite|tudo bem|obrigado|obrigada|obg)\b/g, "")
    .replace(/[!,.?\s]+/g, "");
  return withoutGreetings.length === 0 && /\b(oi|ola|bom dia|boa tarde|boa noite|tudo bem)\b/.test(text);
}
export function isAppointmentStatusRequest(message: string): boolean {
  const text = normalized(message);
  const startsNewBooking = /\b(marcar|marca|marque|agendar|agenda|agende)\b/.test(text)
    && /\b(quero|queria|gostaria|preciso|posso|poderia|nova|novo)\b/.test(text);
  if (startsNewBooking) return false;
  const mentionsExistingAppointment = /\b(consulta|retorno|agendamento|horario)\b/.test(text);
  const asksForSchedule = /\b(quando|que dia|qual dia|que horas|qual horario|pra quando|para quando|ficou marcad[ao]|esta marcad[ao]|proxim[ao] consulta|minha consulta|meu retorno|gerenciar consulta|ver (?:minha )?consulta|consultar agendamento|minha agenda)\b/.test(text);
  return mentionsExistingAppointment && asksForSchedule;
}
export function isTreatmentStatusRequest(message: string): boolean {
  const text = normalized(message);
  const mentionsOngoingTreatment = /\b(protese|proteses|aparelho|molde|laboratorio|tratamento|peca|pecas)\b/.test(text);
  const asksForProgress = /\b(pront[ao]s?|ficaria[m]? pront[ao]s?|andamento|previsao|prazo|entrega|chegou|chegar|resultado|termina|terminar|finaliza|finalizar)\b/.test(text);
  return mentionsOngoingTreatment && asksForProgress;
}
export function classifyIntent(message: string): MessageIntent {
  const text = normalized(message);
  if (text === "menu.agenda") return "schedule";
  if (text === "menu.insurance") return "insurance";
  if (text === "menu.procedures") return "procedure";
  if (["menu.questions", "menu.unsupported_media"].includes(text)) return "faq";
  if (text === "menu.handoff") return "human";
  if (text === "appointment.confirm") return "confirm";
  if (isGreetingMessage(message)) return "greeting";
  if (isAccessLinkRequest(message)) return "schedule";
  if (isExplicitHumanRequest(message)) return "human";
  if (isAppointmentStatusRequest(message)) return "appointment_status";
  if (isTreatmentStatusRequest(message)) return "treatment_status";
  if (/\b(remarcar|reagendar|mudar.*horario)\b/.test(text)) return "reschedule";
  if (/\b(cancelar|desmarcar)\b/.test(text)) return "cancel";
  if (/\b(confirmo|confirmar(?: minha)? presenca|vou comparecer|estarei presente)\b/.test(text)) return "confirm";
  if (/\b(endereco|localizacao|onde fica|qual.*sala|sala.*qual|horario de funcionamento|funcionamento|documentos|pagamento|pagar|cartao|credito|debito|pix|parcelar|estacionamento)\b/.test(text)) return "faq";
  if (/\b(procedimento|tratamento|limpeza|profilaxia|clareamento|canal|implante|protese|ortodontia|aparelho|extracao|extrair|siso|urgencia|odontopediatria)\b/.test(text)) return "procedure";
  if (/\b(marcar|marca|marque|agendar|agenda|agende|consulta|horario)\b/.test(text)) return "schedule";
  if (/\b(plano|convenio|aceit\w*|cobertura)\b/.test(text)) return "insurance";
  if (/\b(como|quando|onde|duvida|pergunta)\b/.test(text)) return "faq";
  return "conversation";
}
