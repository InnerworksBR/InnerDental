import { z } from "zod";
import { isAutomatedReplyEcho, menuActions } from "@/domain/messaging/templates";

const buttonResponseSchema = z.object({
  selectedButtonId: z.string().optional(),
  selectedDisplayText: z.string().optional(),
}).passthrough();

const listResponseSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  singleSelectReply: z.object({ selectedRowId: z.string().optional() }).passthrough().optional(),
}).passthrough();

const templateButtonResponseSchema = z.object({
  selectedId: z.string().optional(),
  selectedDisplayText: z.string().optional(),
}).passthrough();

const interactiveResponseSchema = z.object({
  nativeFlowResponseMessage: z.object({
    name: z.string().optional(),
    paramsJson: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

export const evolutionWebhookSchema = z.object({
  event: z.string().min(1),
  apikey: z.string().min(1),
  data: z.object({
    key: z.object({ id: z.string().min(1), remoteJid: z.string().min(1), fromMe: z.boolean().optional() }),
    message: z.object({
      conversation: z.string().optional(),
      extendedTextMessage: z.object({ text: z.string().optional() }).passthrough().optional(),
      buttonsResponseMessage: buttonResponseSchema.optional(),
      listResponseMessage: listResponseSchema.optional(),
      templateButtonReplyMessage: templateButtonResponseSchema.optional(),
      interactiveResponseMessage: interactiveResponseSchema.optional(),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

export type EvolutionWebhook = z.infer<typeof evolutionWebhookSchema>;

const supportedMenuActions = new Set<string>(Object.values(menuActions));
const unsupportedMediaTypes = ["audioMessage", "imageMessage", "videoMessage", "documentMessage", "stickerMessage"];

function nativeFlowAction(paramsJson?: string) {
  if (!paramsJson) return null;
  try {
    const params = JSON.parse(paramsJson) as Record<string, unknown>;
    return [params.id, params.selectedId, params.selectedRowId].find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;
  } catch {
    return null;
  }
}

function interactiveText(message: EvolutionWebhook["data"]["message"]) {
  const action = message.buttonsResponseMessage?.selectedButtonId
    ?? message.listResponseMessage?.singleSelectReply?.selectedRowId
    ?? message.templateButtonReplyMessage?.selectedId
    ?? nativeFlowAction(message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson);
  if (action && supportedMenuActions.has(action)) return action;
  return message.buttonsResponseMessage?.selectedDisplayText
    ?? message.listResponseMessage?.title
    ?? message.listResponseMessage?.description
    ?? message.templateButtonReplyMessage?.selectedDisplayText
    ?? null;
}

function outboundText(message: EvolutionWebhook["data"]["message"]): string | null {
  const raw = message as Record<string, unknown>;
  const buttons = raw.buttonsMessage as { contentText?: unknown; text?: unknown } | undefined;
  const interactive = raw.interactiveMessage as { body?: { text?: unknown } } | undefined;
  return message.conversation
    ?? message.extendedTextMessage?.text
    ?? (typeof buttons?.contentText === "string" ? buttons.contentText : null)
    ?? (typeof buttons?.text === "string" ? buttons.text : null)
    ?? (typeof interactive?.body?.text === "string" ? interactive.body.text : null);
}

function remotePhone(payload: EvolutionWebhook): string | null {
  const phone = payload.data.key.remoteJid.split("@")[0].replace(/\D/g, "");
  return /^\d{12,15}$/.test(phone) ? phone : null;
}

export function normalizeFromMeActivity(payload: EvolutionWebhook) {
  if (payload.event !== "messages.upsert" || payload.data.key.fromMe !== true) return null;
  const phone = remotePhone(payload);
  if (!phone) return null;
  const text = outboundText(payload.data.message)?.trim().slice(0, 4000) || null;
  return { externalId: payload.data.key.id, phone, text };
}

export function normalizeIncomingMessage(payload: EvolutionWebhook) {
  // Evolution publishes sent messages and status updates too. Only an explicit
  // inbound upsert may enter the bot queue; otherwise replies can echo forever.
  if (payload.event !== "messages.upsert" || payload.data.key.fromMe !== false) return null;
  const phone = remotePhone(payload);
  const message = payload.data.message;
  const mediaFallback = unsupportedMediaTypes.some((type) => Boolean((message as Record<string, unknown>)[type])) ? menuActions.unsupportedMedia : "";
  const text = interactiveText(message) ?? message.conversation ?? message.extendedTextMessage?.text ?? mediaFallback;
  if (!phone || !text.trim() || isAutomatedReplyEcho(text)) return null;
  return { externalId: payload.data.key.id, phone, text: text.trim().slice(0, 4000) };
}
