/**
 * Parser único de intenção (substitui router-tools + conversation-classifier).
 *
 * Diferença fundamental em relação ao router antigo:
 *   - ANTES: a LLM escolhia uma de 18 ferramentas e decidia o que responder.
 *   - AGORA: a LLM só classifica a mensagem do paciente e devolve JSON estruturado.
 *             Quem decide o que responder é o `decisor.ts` em código puro.
 *
 * A LLM NÃO pode:
 *   - inventar horários
 *   - decidir se um plano é aceito
 *   - escolher um procedimento
 *   - confirmar uma consulta
 *   - falar de algo que não está em `verified-facts`
 *
 * A LLM PODE:
 *   - classificar a intenção do paciente em uma das 6 categorias
 *   - extrair sinais que ajudam a próxima pergunta (procedimento_hint, plan_hint)
 *   - detectar sentimento (pra escalonar pro humano se necessário)
 *   - identificar se o paciente quer falar com gente
 *
 * O JSON retornado é validado por Zod antes de chegar no decisor.
 */

import { z } from "zod";

/**
 * As 6 intenções possíveis. Mantemos o conjunto pequeno de propósito:
 * cada intenção mapeia 1:1 para um conjunto de templates, sem ambiguidade.
 */
export const INTENT = [
  "saudacao",
  "faq",
  "plano",
  "procedimento",
  "agendar",
  "humano",
] as const;

export type Intent = (typeof INTENT)[number];

/**
 * Slots que o parser pode extrair da mensagem.
 * Esses slots alimentam o estado da conversa (`ConversationSlots`),
 * mas com chaves novas e mais semânticas (não operacionais).
 */
export const ParserSlotsSchema = z.object({
  nome: z.string().min(2).max(80).optional(),
  procedimento_hint: z.string().max(80).optional(),
  plano_hint: z.string().max(80).optional(),
  para_outra_pessoa: z.boolean().optional(),
});

export type ParserSlots = z.infer<typeof ParserSlotsSchema>;

export const SENTIMENT = ["ok", "duvida", "impaciente", "irritado"] as const;
export type Sentiment = (typeof SENTIMENT)[number];

export const ParserOutputSchema = z.object({
  intent: z.enum(INTENT),
  sentiment: z.enum(SENTIMENT).default("ok"),
  confidence: z.number().min(0).max(1),
  slots: ParserSlotsSchema.default({}),
  needs_human: z.boolean().default(false),
  reason: z.string().max(200).optional(),
});

export type ParserOutput = z.infer<typeof ParserOutputSchema>;

/**
 * Entrada do parser. Não inclui nenhum segredo, nenhum telefone, nenhum dado clínico.
 * Só o necessário pra classificar.
 */
export type ParserInput = {
  message: string;
  recentTurns: Array<{ role: "patient" | "luna"; text: string }>;
  awaitingSlot: "nome" | "procedimento" | "plano" | "para_quem" | null;
};

/**
 * System prompt do parser. Define a fronteira entre o que a IA pode e não pode fazer.
 *
 * Toda resposta da IA passa por validação Zod, então mesmo um output malformado
 * não chega ao decisor.
 */
const PARSER_SYSTEM_PROMPT = `Você é o classificador de intenção do Luna Agenda, o WhatsApp da clínica da Dra. Priscila.

Sua ÚNICA tarefa é ler a mensagem do paciente e devolver um JSON estruturado. Você NÃO decide o que responder. Quem responde é o sistema.

INTENÇÕES POSSÍVEIS:
- "saudacao": primeira mensagem, cumprimento, "oi", "boa tarde". Não inclui pedido de agendamento.
- "faq": pergunta sobre endereço, horário de funcionamento, formas de pagamento, estacionamento, documentos para levar.
- "plano": quer saber se o plano X é aceito, ou quer lista de planos aceitos.
- "procedimento": quer saber se faz determinado tratamento (limpeza, canal, clareamento, etc) ou quer lista de procedimentos.
- "agendar": quer marcar, remarcar ou cancelar consulta. Inclui variações como "posso ir amanhã?", "tem horário?".
- "humano": pediu explicitamente pra falar com gente, está irritado, reclamou, ou fora do escopo.

SLOTS QUE VOCÊ PODE EXTRAIR (só preencha se a mensagem trouxer a informação explicitamente):
- "nome": nome do paciente, se ele apresentou
- "procedimento_hint": nome do procedimento que ele mencionou (limpeza, canal, etc)
- "plano_hint": nome do plano que ele mencionou (Unimed, Bradesco, etc)
- "para_outra_pessoa": true se ele disse que é pra filho, marido, etc

SENTIMENTO:
- "ok" na maioria dos casos
- "duvida" se ele perguntou várias coisas ou pediu esclarecimento
- "impaciente" se mencionou urgência ("preciso urgente", "é pra hoje")
- "irritado" se reclamou, xingou ou ameaçou cancelar

NEEDS_HUMAN: true APENAS se:
- sentiment = "irritado"
- intent = "humano" (pediu explicitamente)
- paciente mencionou emergência médica ("tô com dor", "sangrando") → marca como agendar + needs_human=true, razão "mencionou urgência"

REGRAS:
1. NUNCA invente dados. Se não tem certeza, omite o slot.
2. NUNCA mencione horários, valores ou planos que não estão no contexto.
3. Se a mensagem for ambígua entre "saudacao" e "agendar", prefira "saudacao" e deixe o sistema perguntar.
4. Confidence: 0.0 a 1.0. Seja conservador. Use 0.5-0.7 quando tiver dúvida, 0.9+ só quando óbvio.
5. SEMPRE devolva JSON válido. Nada de texto fora do JSON.

EXEMPLOS:
- "oi, boa tarde" → {"intent":"saudacao","sentiment":"ok","confidence":0.95,"slots":{}}
- "vocês aceitam Unimed?" → {"intent":"plano","sentiment":"ok","confidence":0.92,"slots":{"plano_hint":"Unimed"}}
- "qual o endereço?" → {"intent":"faq","sentiment":"ok","confidence":0.93,"slots":{}}
- "faz clareamento?" → {"intent":"procedimento","sentiment":"ok","confidence":0.9,"slots":{"procedimento_hint":"clareamento"}}
- "meu nome é João, quero marcar limpeza" → {"intent":"agendar","sentiment":"ok","confidence":0.94,"slots":{"nome":"João","procedimento_hint":"limpeza"}}
- "quero falar com alguém" → {"intent":"humano","sentiment":"ok","confidence":0.95,"slots":{},"needs_human":true}
- "vocês são péssimos, nunca mais volto" → {"intent":"humano","sentiment":"irritado","confidence":0.92,"slots":{},"needs_human":true,"reason":"reclamação"}`;

/**
 * Erro lançado quando o parser falha. O worker captura e cai pra um caminho seguro.
 */
export class ParserError extends Error {
  readonly code: "OPENAI_UNREACHABLE" | "OPENAI_TIMEOUT" | "OPENAI_EMPTY" | "OPENAI_SCHEMA_INVALID";
  constructor(
    code: "OPENAI_UNREACHABLE" | "OPENAI_TIMEOUT" | "OPENAI_EMPTY" | "OPENAI_SCHEMA_INVALID",
    message?: string,
  ) {
    super(message ?? code);
    this.code = code;
  }
}

/**
 * Chamada única ao LLM. Sem tools, sem funções, sem cadeia de raciocínio.
 * Apenas classifica e devolve JSON.
 */
export async function parseIntent(
  input: ParserInput,
  config: { apiKey: string; model: string; timeoutMs?: number },
): Promise<ParserOutput> {
  const controller = new AbortController();
  const timeoutMs = config.timeoutMs ?? 4000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const userMessage = input.awaitingSlot
    ? `Contexto: estamos aguardando o paciente preencher o campo "${input.awaitingSlot}".\n\nÚltimas trocas:\n${formatRecentTurns(input.recentTurns)}\n\nMensagem atual do paciente:\n"""${input.message}"""`
    : `Últimas trocas:\n${formatRecentTurns(input.recentTurns)}\n\nMensagem atual do paciente:\n"""${input.message}"""`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PARSER_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ParserError("OPENAI_UNREACHABLE", `OpenAI HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = body.choices?.[0]?.message?.content;
    if (!raw) {
      throw new ParserError("OPENAI_EMPTY", "Resposta vazia do parser");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ParserError("OPENAI_SCHEMA_INVALID", "JSON inválido do parser");
    }

    const validated = ParserOutputSchema.safeParse(parsed);
    if (!validated.success) {
      throw new ParserError("OPENAI_SCHEMA_INVALID", `Schema inválido: ${validated.error.message}`);
    }
    return validated.data;
  } catch (error) {
    if (error instanceof ParserError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ParserError("OPENAI_TIMEOUT", "Parser excedeu timeout");
    }
    throw new ParserError("OPENAI_UNREACHABLE", `Falha de rede: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function formatRecentTurns(turns: Array<{ role: "patient" | "luna"; text: string }>): string {
  if (turns.length === 0) return "(primeira mensagem)";
  return turns
    .slice(-6)
    .map((turn) => `${turn.role === "patient" ? "Paciente" : "Luna"}: ${turn.text.slice(0, 200)}`)
    .join("\n");
}
