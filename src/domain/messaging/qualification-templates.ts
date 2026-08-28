/**
 * Templates do novo fluxo de qualificação (PR da remodelação).
 *
 * Diferente dos templates antigos, estes são:
 *   - Textuais (não-interactive) — mais simples, mais legíveis no WhatsApp
 *   - Sem promessas operacionais ("vou marcar", "horário confirmado")
 *   - Diretos: só coletam dados ou informam que vai passar pra equipe
 *
 * Esses templates são consumidos pelo decisor.ts, não pelo router antigo.
 */

import { readableBrazilianPhone } from "./handoff.ts";
import type { PatientSummary } from "./decisor.ts";

/**
 * Mensagem inicial após saudação do paciente.
 * Apresenta o que a Luna pode fazer, sem prometer demais.
 */
export const newFlowGreetingMessage =
  "Oi! Eu sou a Luna, assistente da clínica da Dra. Priscila 😊\n\n" +
  "Posso te ajudar com:\n" +
  "• *Agendar* uma consulta\n" +
  "• Tirar dúvidas sobre *planos* e *procedimentos*\n" +
  "• Informações de *endereço e horário*\n\n" +
  "Como posso ajudar?";

/**
 * Mensagem enviada à doutora quando um paciente está qualificado.
 * Estruturada pra ela bater o olho e saber o que fazer.
 */
export function handoffToDoctorMessage(
  patientPhone: string,
  summary: PatientSummary,
): string {
  const phone = readableBrazilianPhone(patientPhone);
  return (
    "🔔 *Novo paciente quer agendar*\n\n" +
    `*Nome:* ${summary.nome}\n` +
    `*Procedimento:* ${summary.procedimento}\n` +
    `*Plano:* ${summary.plano}\n` +
    `*Para:* ${summary.para_quem}\n` +
    `*Telefone:* ${phone}\n` +
    (summary.observacao ? `\n*Obs:* ${summary.observacao}\n` : "\n") +
    "\n_Toque no número acima pra abrir a conversa no WhatsApp._"
  );
}

/**
 * Mensagem enviada ao paciente quando a qualificação termina.
 * Deixa claro que um humano vai entrar em contato.
 */
export const patientHandoffAckMessage =
  "Perfeito, anotado! ✅\n\n" +
  "Vou passar seu pedido pra equipe da Dra. Priscila agora. " +
  "Eles vão te chamar aqui no WhatsApp em breve pra combinar o melhor horário.";

/**
 * Mensagem enviada ao paciente quando ele é escalado por urgência ou irritação.
 * Diferente do ack normal: informa que vai ser prioridade.
 */
export const patientUrgentHandoffAckMessage =
  "Entendi. Vou chamar a equipe agora — eles vão te responder aqui em alguns minutos. " +
  "Se for emergência, procure o pronto-socorro odontológico mais próximo.";

/**
 * Mensagem para paciente que pediu explicitamente pra falar com humano.
 */
export const patientRequestedHumanMessage =
  "Beleza, vou te conectar com a equipe agora. Eles continuam o atendimento por aqui mesmo.";

/**
 * Mensagem quando o paciente envia áudio/imagem (não texto).
 */
export const unsupportedMediaMessage =
  "Desculpa, não consigo ler áudios ou imagens aqui. " +
  "Se quiser, escreve sua dúvida ou fala *equipe* que eu te conecto com alguém.";

/**
 * Perguntas de qualificação. Cada uma pede UM campo só.
 * Texto curto pra não intimidar o paciente.
 */
export const qualificationQuestions = {
  nome: "Beleza, pra te conectar com a doutora, me diz seu *nome completo*?",
  procedimento:
    "Qual *procedimento* você quer marcar? (limpeza, canal, clareamento, avaliação...)",
  plano: "Você tem *plano odontológico* ou prefere *particular*?",
  para_quem: "A consulta é *pra você* ou *pra outra pessoa*?",
} as const;

/**
 * Confirma a classificação interna do parser (não vai pro paciente).
 * Usado pra logging e auditoria.
 */
export function parserAuditLine(input: {
  intent: string;
  confidence: number;
  sentiment: string;
  needs_human: boolean;
}): string {
  return `parser:intent=${input.intent},confidence=${input.confidence.toFixed(2)},sentiment=${input.sentiment},needs_human=${input.needs_human}`;
}
