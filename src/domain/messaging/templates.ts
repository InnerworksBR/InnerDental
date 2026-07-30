import type { MessageIntent } from "./intent";
import { readableBrazilianPhone } from "./handoff.ts";

export const menuActions = {
  agenda: "menu.agenda",
  questions: "menu.questions",
  handoff: "menu.handoff",
  insurance: "menu.insurance",
  procedures: "menu.procedures",
  unsupportedMedia: "menu.unsupported_media",
  appointmentConfirm: "appointment.confirm",
} as const;

export type InteractiveButton =
  | { type: "reply"; id: string; displayText: string }
  | { type: "url"; displayText: string; url: string };

export type InteractiveMessage = {
  title: string;
  description: string;
  footer?: string;
  buttons: InteractiveButton[];
  fallbackText: string;
};

const intentCopy: Record<"schedule" | "reschedule" | "cancel", { title: string; action: string }> = {
  schedule: { title: "Agendar consulta", action: "agendar sua consulta" },
  reschedule: { title: "Remarcar consulta", action: "escolher um novo horário" },
  cancel: { title: "Cancelar consulta", action: "cancelar sua consulta" },
};

export function accessLinkMessage(url: string, intent: MessageIntent = "schedule") {
  const copy = intentCopy[intent as keyof typeof intentCopy] ?? intentCopy.schedule;
  return `*${copy.title}*\n\nUse o link seguro abaixo para ${copy.action}:\n${url}\n\nO acesso expira em 30 minutos.`;
}

export function accessLinkInteractiveMessage(url: string, intent: MessageIntent = "schedule"): InteractiveMessage {
  const copy = intentCopy[intent as keyof typeof intentCopy] ?? intentCopy.schedule;
  return {
    title: copy.title,
    description: `Use o botão abaixo para ${copy.action}. O acesso é seguro e expira em 30 minutos.`,
    footer: "Luna Agenda",
    buttons: [{ type: "url", displayText: "Abrir minha agenda", url }],
    fallbackText: accessLinkMessage(url, intent),
  };
}

export function otpMessage(code: string) {
  return `*Seu código de acesso*\n\n*${code}*\n\nVálido por 5 minutos.\nNão compartilhe este código.`;
}

function appointmentDate(startAt: string) {
  const date = new Date(startAt);
  const day = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(date).replace(":", "h");
  return { day: day.charAt(0).toUpperCase() + day.slice(1), time };
}

function appointmentCopy(event: string) {
  if (event === "appointment.cancelled") return { icon: "❌", title: "Consulta cancelada", action: "Agendar nova consulta" };
  if (event === "appointment.rescheduled") return { icon: "✅", title: "Consulta remarcada", action: "Gerenciar consulta" };
  if (event === "appointment.reminder") return { icon: "⏰", title: "Lembrete da consulta", action: "Gerenciar consulta" };
  return { icon: "✅", title: "Consulta confirmada", action: "Gerenciar consulta" };
}

export function appointmentMessage(event: string, startAt: string, professionalName?: string, accessUrl?: string) {
  const { day, time } = appointmentDate(startAt);
  const copy = appointmentCopy(event);
  const professional = professionalName ? `\n👤 ${professionalName}` : "";
  const nextStep = event === "appointment.cancelled"
    ? "Quando quiser, você pode escolher um novo horário."
    : "Se precisar consultar ou alterar o agendamento, use sua agenda.";
  const link = accessUrl ? `\n\n${accessUrl}` : "";
  return `${copy.icon} *${copy.title}*\n\n📅 ${day}\n🕒 ${time}${professional}\n\n${nextStep}${link}`;
}

export function appointmentInteractiveMessage(event: string, startAt: string, accessUrl: string, professionalName?: string): InteractiveMessage {
  const { day, time } = appointmentDate(startAt);
  const copy = appointmentCopy(event);
  const professional = professionalName ? `\n👤 ${professionalName}` : "";
  return {
    title: `${copy.icon} ${copy.title}`,
    description: `📅 ${day}\n🕒 ${time}${professional}`,
    footer: "Luna Agenda",
    buttons: [{ type: "url", displayText: copy.action, url: accessUrl }],
    fallbackText: appointmentMessage(event, startAt, professionalName, accessUrl),
  };
}

export function appointmentConfirmationRequestMessage(startAt: string, accessUrl: string, professionalName?: string) {
  const { day, time } = appointmentDate(startAt);
  const professional = professionalName ? `\n👤 ${professionalName}` : "";
  return `📅 *Confirme sua presença*\n\nSua consulta é amanhã:\n📆 ${day}\n🕒 ${time}${professional}\n\nResponda *CONFIRMO* por aqui. Para remarcar ou cancelar, use sua agenda:\n${accessUrl}`;
}

export function appointmentConfirmationRequestInteractiveMessage(startAt: string, accessUrl: string, professionalName?: string): InteractiveMessage {
  const { day, time } = appointmentDate(startAt);
  const professional = professionalName ? `\n👤 ${professionalName}` : "";
  return {
    title: "📅 Confirme sua presença",
    description: `Sua consulta é amanhã:\n📆 ${day}\n🕒 ${time}${professional}`,
    footer: "Luna Agenda",
    buttons: [
      { type: "reply", id: menuActions.appointmentConfirm, displayText: "Sim, confirmo" },
      { type: "url", displayText: "Remarcar ou cancelar", url: accessUrl },
    ],
    fallbackText: appointmentConfirmationRequestMessage(startAt, accessUrl, professionalName),
  };
}

export function attendanceConfirmationReplyMessage(status: "confirmed" | "already_confirmed" | "not_found" | "ambiguous", startAt?: string, accessUrl?: string) {
  if (status === "confirmed" && startAt) {
    const { day, time } = appointmentDate(startAt);
    return `✅ *Presença confirmada*\n\nTudo certo para ${day}, às ${time}. Até lá!`;
  }
  if (status === "already_confirmed" && startAt) {
    const { day, time } = appointmentDate(startAt);
    return `✅ *Presença já confirmada*\n\nSua confirmação para ${day}, às ${time}, já estava registrada.`;
  }
  const link = accessUrl ? `\n\nAbra sua agenda segura para conferir:\n${accessUrl}` : "";
  if (status === "ambiguous") return `*Confirmação de presença*\n\nEncontrei mais de uma consulta próxima e não quero confirmar a errada.${link}`;
  return `*Confirmação de presença*\n\nNão encontrei uma consulta próxima aguardando sua confirmação.${link}`;
}

export function upcomingAppointmentInteractiveMessage(status: "found" | "not_found", accessUrl: string, startAt?: string, professionalName?: string): InteractiveMessage {
  if (status === "found" && startAt) {
    const { day, time } = appointmentDate(startAt);
    const professional = professionalName ? `\n👤 ${professionalName}` : "";
    return {
      title: "📅 Próxima consulta",
      description: `${day}, às ${time}.${professional}`,
      footer: "Luna Agenda",
      buttons: [{ type: "url", displayText: "Gerenciar consulta", url: accessUrl }],
      fallbackText: `📅 *Sua próxima consulta*\n\n${day}, às ${time}.${professional}\n\nPara consultar ou alterar o agendamento:\n${accessUrl}`,
    };
  }
  return {
    title: "Consulta não localizada",
    description: "Não encontrei uma consulta futura vinculada a este número.",
    footer: "Confira sua agenda ou escolha um novo horário.",
    buttons: [{ type: "url", displayText: "Abrir minha agenda", url: accessUrl }],
    fallbackText: `Não encontrei uma consulta futura vinculada a este número. Você pode conferir sua agenda ou escolher um novo horário aqui:\n${accessUrl}`,
  };
}

export type DailyConfirmationSummary = {
  summary_date: string;
  total: number;
  confirmed: number;
  unconfirmed: Array<{ name: string; phone: string; start_at: string }>;
};

function safeSummaryText(value: string, fallback: string) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim().slice(0, 160) || fallback;
}

export function dailyConfirmationSummaryMessage(summary: DailyConfirmationSummary) {
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date(`${summary.summary_date}T12:00:00-03:00`));
  const heading = `📋 *Confirmações de hoje*\n${date.charAt(0).toUpperCase() + date.slice(1)}`;
  if (summary.total === 0) return `${heading}\n\nHoje não há consultas agendadas.\n\n✅ 0 de 0 confirmadas.`;
  const count = `✅ *${summary.confirmed} de ${summary.total}* ${summary.total === 1 ? "consulta confirmada" : "consultas confirmadas"}.`;
  if (summary.unconfirmed.length === 0) return `${heading}\n\n${count}\n\nTodos os pacientes confirmaram presença.`;
  const pending = summary.unconfirmed.map((item) => {
    const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date(item.start_at));
    return `• ${time} — ${safeSummaryText(item.name, "Não informado")} — ${readableBrazilianPhone(item.phone)}`;
  }).join("\n");
  return `${heading}\n\n${count}\n\n⏳ *Ainda não confirmaram:*\n${pending}`;
}

export const greetingMessage = "Olá! Sou a assistente virtual da Luna 😊\n\nComo posso ajudar?\n\n• Agendar ou gerenciar uma consulta\n• Tirar dúvidas sobre planos e procedimentos\n• Falar com a equipe\n\nVocê pode escrever sua dúvida ou escolher uma opção.";

export const greetingInteractiveMessage: InteractiveMessage = {
  title: "Olá! Sou a assistente da Luna 😊",
  description: "Como posso ajudar?",
  footer: "Você também pode escrever sua dúvida.",
  buttons: [
    { type: "reply", id: menuActions.agenda, displayText: "Agendar/gerenciar" },
    { type: "reply", id: menuActions.questions, displayText: "Planos e dúvidas" },
    { type: "reply", id: menuActions.handoff, displayText: "Falar com equipe" },
  ],
  fallbackText: greetingMessage,
};

export const questionsInteractiveMessage: InteractiveMessage = {
  title: "Planos e procedimentos",
  description: "O que você gostaria de consultar?",
  footer: "As respostas usam o cadastro atualizado da clínica.",
  buttons: [
    { type: "reply", id: menuActions.insurance, displayText: "Planos aceitos" },
    { type: "reply", id: menuActions.procedures, displayText: "Procedimentos" },
    { type: "reply", id: menuActions.handoff, displayText: "Falar com equipe" },
  ],
  fallbackText: "*Planos e procedimentos*\n\nQual informação você procura? Escreva o nome do plano ou do procedimento. Se preferir, peça para falar com a equipe.",
};

export const insurancePromptMessage = "Qual é o nome do plano que você gostaria de consultar?";
export const initialInsurancePromptMessage = "Para continuar com o agendamento, qual é o seu plano odontológico? Se o atendimento for particular, responda *Particular*.";
export const unsupportedInsuranceMessage = "Esse plano não está entre os planos atendidos pela clínica no momento. Se o nome foi informado incorretamente, envie o plano correto. Para outros assuntos, pode me dizer como posso ajudar.";
export const caixaInsuranceMessage = "Os planos que possuem “Caixa” no nome não são mais atendidos pela clínica. Se você já está em tratamento ou precisa tratar de uma consulta existente, explique o que precisa para direcionarmos corretamente.";
export const procedurePromptMessage = "Qual procedimento você gostaria de consultar?";

export const unsupportedMediaInteractiveMessage: InteractiveMessage = {
  title: "Não consegui ler essa mensagem",
  description: "Ainda não consigo ouvir áudios ou interpretar arquivos por aqui. Por favor, escreva sua dúvida em uma mensagem.",
  footer: "Se preferir, posso chamar a equipe.",
  buttons: [{ type: "reply", id: menuActions.handoff, displayText: "Falar com equipe" }],
  fallbackText: "Ainda não consigo ouvir áudios ou interpretar arquivos por aqui. Por favor, escreva sua dúvida em uma mensagem ou peça para falar com a equipe.",
};

export const humanFallbackMessage = "Entendi. Encaminhei sua solicitação com o contexto para a equipe responsável, que continuará o atendimento por aqui assim que estiver disponível.";
export const treatmentStatusHandoffMessage = "Entendi que você quer confirmar o andamento do seu tratamento. Encaminhei a solicitação para a equipe responsável verificar e continuar o atendimento por aqui.";

export function knowledgeAnswerInteractiveMessage(answer: string): InteractiveMessage {
  return {
    title: "Informação da clínica",
    description: answer,
    footer: "Luna Agenda",
    buttons: [{ type: "reply", id: menuActions.questions, displayText: "Outra dúvida" }],
    fallbackText: answer,
  };
}

export function isAutomatedReplyEcho(text: string) {
  const value = text.trim();
  return value.startsWith("Olá! Sou a assistente")
    || value.startsWith("*Agendar consulta*")
    || value.startsWith("*Remarcar consulta*")
    || value.startsWith("*Cancelar consulta*")
    || value.startsWith("Entendi. Já encaminhei")
    || value.startsWith("✅ *Consulta confirmada*")
    || value.startsWith("✅ *Consulta remarcada*")
    || value.startsWith("❌ *Consulta cancelada*")
    || value.startsWith("⏰ *Lembrete da consulta*")
    || value.startsWith("📅 *Confirme sua presença*")
    || value.startsWith("✅ *Presença confirmada*")
    || value.startsWith("✅ *Presença já confirmada*")
    || value.startsWith("*Confirmação de presença*")
    || value.startsWith("📋 *Confirmações de hoje*")
    || value.startsWith("📅 *Sua próxima consulta*")
    || value.startsWith("Não encontrei uma consulta futura")
    || value.startsWith("*Seu código de acesso*");
}
