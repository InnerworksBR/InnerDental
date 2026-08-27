export type RawConversationMessage = {
  role?: "user" | "bot" | "system";
  phone?: string;
  name?: string;
  text?: string;
  intent?: string | null;
  action?: string | null;
  lastError?: string | null;
  correlationId?: string | null;
};

export type MaskedConversationMessage = {
  role: "user" | "bot" | "system";
  text: string;
  intent: string | null;
  action: string | null;
  lastError: string | null;
  correlationId: string | null;
};

const PHONE_REGEX = /\+?\d[\d\s().-]{6,}\d/g;

function maskPhonesInText(text: string): string {
  return text.replace(PHONE_REGEX, (match) => {
    const digits = match.replace(/\D/g, "");
    return digits.length >= 8 ? "[PHONE]" : match;
  });
}

function maskPhonesDeep(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return maskPhonesInText(value);
  if (Array.isArray(value)) return value.map(maskPhonesDeep);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (key === "phone" || key === "phone_hash") {
        result[key] = "[PHONE]";
      } else if (key === "name" || key === "patient_name" || key === "patientName") {
        // Defesa em profundidade: nomes nunca são enviados para a LLM.
        continue;
      } else {
        result[key] = maskPhonesDeep(v);
      }
    }
    return result;
  }
  return value;
}

export function maskConversationForLlm(messages: RawConversationMessage[]): MaskedConversationMessage[] {
  return messages.map((message) => {
    const masked = maskPhonesDeep({
      text: message.text ?? "",
    }) as { text: string };
    return {
      role: message.role ?? "user",
      text: masked.text.slice(0, 600),
      intent: message.intent ?? null,
      action: message.action ?? null,
      lastError: message.lastError ?? null,
      correlationId: message.correlationId ?? null,
    };
  });
}
