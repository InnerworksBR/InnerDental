import { withBoundedRetry } from "../../lib/reliability/retry.ts";
import type { InteractiveButton } from "../../domain/messaging/templates.ts";

export class EvolutionApiError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}

export class EvolutionClient {
  private readonly config: { baseUrl: string; apiKey: string; instance: string };
  private readonly fetcher: typeof fetch;
  constructor(config: { baseUrl: string; apiKey: string; instance: string }, fetcher: typeof fetch = fetch) { this.config = config; this.fetcher = fetcher; }

  private async post(path: string, body: Record<string, unknown>): Promise<void> {
    await withBoundedRetry(async () => {
      try {
        const response = await this.fetcher(`${this.config.baseUrl.replace(/\/$/, "")}${path}/${encodeURIComponent(this.config.instance)}`, {
          method: "POST", headers: { "Content-Type": "application/json", apikey: this.config.apiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) throw new EvolutionApiError(`EVOLUTION_${response.status}`, response.status === 429 || response.status >= 500);
      } catch (error) {
        if (error instanceof EvolutionApiError) throw error;
        throw new EvolutionApiError("EVOLUTION_UNAVAILABLE", true);
      }
    }, { maxAttempts: 3, baseDelayMs: 120, maxDelayMs: 1_000, isRetryable: (error) => error instanceof EvolutionApiError && error.retryable });
  }

  async sendText(phone: string, text: string): Promise<void> {
    if (!/^\d{12,15}$/.test(phone) || !text.trim()) throw new EvolutionApiError("INVALID_MESSAGE");
    await this.post("/message/sendText", { number: phone, text });
  }

  async sendButtons(phone: string, message: { title: string; description: string; footer?: string; buttons: InteractiveButton[] }): Promise<void> {
    if (!/^\d{12,15}$/.test(phone) || !message.title.trim() || !message.description.trim() || message.buttons.length < 1 || message.buttons.length > 3) throw new EvolutionApiError("INVALID_INTERACTIVE_MESSAGE");
    const hasReply = message.buttons.some((button) => button.type === "reply");
    const hasUrl = message.buttons.some((button) => button.type === "url");
    if ((hasReply && hasUrl) || (hasUrl && message.buttons.length > 2)) throw new EvolutionApiError("INVALID_INTERACTIVE_BUTTONS");
    for (const button of message.buttons) {
      if (!button.displayText.trim()) throw new EvolutionApiError("INVALID_INTERACTIVE_BUTTON");
      if (button.type === "reply" && !button.id.trim()) throw new EvolutionApiError("INVALID_INTERACTIVE_BUTTON");
      if (button.type === "url") {
        try {
          const url = new URL(button.url);
          if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol");
        } catch {
          throw new EvolutionApiError("INVALID_INTERACTIVE_URL");
        }
      }
    }
    await this.post("/message/sendButtons", {
      number: phone,
      title: message.title,
      description: message.description,
      footer: message.footer,
      buttons: message.buttons,
    });
  }
}
