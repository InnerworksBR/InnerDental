const MAX_REASON_LENGTH = 120;

function cleanText(value: string, fallback: string): string {
  const cleaned = value.replace(/[\r\n\t]+/g, " ").replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

export function handoffReason(messageText: string): string {
  if (messageText === "menu.handoff") return "Solicitou falar diretamente com a equipe";
  const reason = cleanText(messageText, "Solicitou atendimento da equipe");
  return reason.length <= MAX_REASON_LENGTH ? reason : `${reason.slice(0, MAX_REASON_LENGTH - 1).trimEnd()}…`;
}

export function readableBrazilianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(digits)) {
    const national = digits.slice(2);
    const areaCode = national.slice(0, 2);
    const local = national.slice(2);
    return `+55 (${areaCode}) ${local.length === 9 ? `${local.slice(0, 5)}-${local.slice(5)}` : `${local.slice(0, 4)}-${local.slice(4)}`}`;
  }
  return `+${digits}`;
}

export function handoffNotificationMessage(input: { patientName: string | null; patientPhone: string; reason: string }): string {
  const name = cleanText(input.patientName ?? "", "Não informado").slice(0, 160);
  const reason = cleanText(input.reason, "Solicitou atendimento da equipe").slice(0, MAX_REASON_LENGTH);
  return `🔔 *Novo pedido de atendimento*\n\n*Nome:* ${name}\n*Telefone:* ${readableBrazilianPhone(input.patientPhone)}\n*Motivo:* ${reason}\n\nO paciente foi informado de que a equipe continuará o atendimento pelo WhatsApp.`;
}
