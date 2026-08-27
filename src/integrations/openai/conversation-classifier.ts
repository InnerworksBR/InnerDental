import { z } from "zod";

import { maskConversationForLlm, type RawConversationMessage } from "@/domain/conversation-analysis/mask";

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["outcome", "confidence", "summary"],
  properties: {
    outcome: {
      type: "string",
      enum: ["success", "confused", "abandoned", "error", "handoff_needed", "spam"],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    summary: { type: "string", minLength: 1, maxLength: 500 },
  },
} as const;

const ResponseSchema = z.object({
  outcome: z.enum(["success", "confused", "abandoned", "error", "handoff_needed", "spam"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(500),
});

export type ClassificationResult = z.infer<typeof ResponseSchema>;

export type ClassifierUsage = { promptTokens: number; completionTokens: number };

export type ClassificationResponse = ClassificationResult & { usage: ClassifierUsage; model: string };

export async function classifyConversation(input: {
  messages: RawConversationMessage[];
  intent?: string | null;
  action?: string | null;
  lastError?: string | null;
  correlationIds?: string[];
}): Promise<ClassificationResponse> {
  if (!apiKey) throw new Error("OPENAI_API_KEY_MISSING");
  const masked = maskConversationForLlm(input.messages);
  const prompt = buildPrompt(masked, input);
  const body = {
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "text",
            text: "Você classifica o desfecho de uma conversa entre paciente e bot de clínica odontológica no WhatsApp. Responda apenas com JSON válido no schema informado. Nunca mencione telefones ou nomes; eles foram mascarados. Seja conciso: 1-2 frases em PT-BR no campo summary.",
          },
        ],
      },
      { role: "user", content: [{ type: "text", text: prompt }] },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "conversation_outcome",
        schema: analysisSchema,
        strict: true,
      },
    },
    max_output_tokens: 220,
    temperature: 0,
  };

  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`OPENAI_${response.status}`);
  const json = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type: string; text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = json.output_text ?? json.output?.flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("") ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("OPENAI_INVALID_JSON");
  }
  const validated = ResponseSchema.parse(parsed);
  return {
    ...validated,
    usage: {
      promptTokens: json.usage?.input_tokens ?? 0,
      completionTokens: json.usage?.output_tokens ?? 0,
    },
    model,
  };
}

function buildPrompt(messages: ReturnType<typeof maskConversationForLlm>, ctx: { intent?: string | null; action?: string | null; lastError?: string | null; correlationIds?: string[] }): string {
  const transcript = messages
    .map((m, i) => `[${i + 1}] (${m.role}) ${m.text}${m.lastError ? ` [erro: ${m.lastError}]` : ""}`)
    .join("\n");
  const meta = [
    ctx.intent ? `intent=${ctx.intent}` : null,
    ctx.action ? `action=${ctx.action}` : null,
    ctx.lastError ? `last_error=${ctx.lastError}` : null,
    ctx.correlationIds && ctx.correlationIds.length ? `correlation_ids=${ctx.correlationIds.join(",")}` : null,
  ].filter(Boolean).join(" | ");
  return `Conversa:\n${transcript}\n\nMetadados: ${meta || "nenhum"}\n\nClassifique o desfecho e gere um resumo curto.`;
}
