import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingWorker } from "../../worker/index";

/**
 * Unit tests for the in-memory token budget that gates `tryRouter`.
 *
 * PR 6 introduced `tokenBudgetDay`/`tokenBudgetUsed` on the worker so the
 * router never exceeds `OPENAI_ROUTING_DAILY_TOKEN_BUDGET` in a single BRT
 * day. The counter is intentionally simple — a 24h sliding window resets at
 * midnight BRT (UTC-3) so the limit tracks clinic hours, not UTC.
 *
 * These tests isolate the budget logic by spying on `currentBrDay`. The
 * worker does not expose the helper, so we monkeypatch the prototype to
 * simulate the day boundary without touching Date.now globally.
 */

interface MessagingWorkerInternal {
  currentBrDay: (now?: Date) => string;
  tokenBudgetDay: string;
  tokenBudgetUsed: number;
  tryRouter: (input: { row: unknown; intent: unknown; knowledge: unknown; verifiedFacts: unknown; messageText: string }) => Promise<{ kind: string; reason?: string; routing?: string }>;
}

const baseRow = { id: "00000000-0000-4000-8000-000000000200", phone: "5513999999999", message_text: "Oi", attempts: 1, lease_token: "lease-budget" };

const buildWorker = (overrides: Record<string, unknown> = {}) => new MessagingWorker(
  { from: () => ({ update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }), rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } as never,
  { sendText: vi.fn().mockResolvedValue(undefined) } as never,
  {
    planTriageEnabled: false,
    pollMs: 100,
    healthPort: 3001,
    allowedRecipients: ["5513999999999"],
    openaiApiKey: "test-budget-key",
    llmRouting: "llm",
    openaiRoutingDailyTokenBudget: 100,
    ...overrides,
  } as never,
);

const asInternal = (worker: MessagingWorker): MessagingWorkerInternal => worker as unknown as MessagingWorkerInternal;

describe("token budget tracker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resets the counter when the BRT day boundary crosses", async () => {
    const worker = buildWorker();
    const internal = asInternal(worker);
    // Pre-load a saturated counter on the previous BRT day.
    internal.tokenBudgetDay = "2026-01-01";
    internal.tokenBudgetUsed = 200;
    // The BRT day flips forward — `tryRouter` must reset the counter
    // before evaluating the budget. The api_key is set so the call
    // progresses past that gate.
    vi.spyOn(internal, "currentBrDay").mockReturnValue("2026-01-02");
    // The OpenAI call will fail (no fetch stub) and fall back to
    // `unreachable`. That's fine — the assertion is on the internal
    // counter, not the response.
    await internal.tryRouter({ row: baseRow, intent: "greeting", knowledge: undefined, verifiedFacts: undefined, messageText: "Oi" });
    expect(internal.tokenBudgetDay).toBe("2026-01-02");
    expect(internal.tokenBudgetUsed).toBe(0);
  });

  it("returns budget_exceeded when the in-memory counter already meets the limit", async () => {
    const worker = buildWorker({ openaiRoutingDailyTokenBudget: 50 });
    const internal = asInternal(worker);
    internal.tokenBudgetDay = internal.currentBrDay();
    internal.tokenBudgetUsed = 50;
    const result = await internal.tryRouter({ row: baseRow, intent: "greeting", knowledge: undefined, verifiedFacts: undefined, messageText: "Oi" });
    expect(result.kind).toBe("regex_fallback");
    expect((result as { reason?: string }).reason).toBe("budget_exceeded");
  });

  it("returns api_key_missing when the API key is unset even with budget headroom", async () => {
    const worker = buildWorker({ openaiApiKey: undefined });
    const internal = asInternal(worker);
    internal.tokenBudgetDay = internal.currentBrDay();
    internal.tokenBudgetUsed = 0;
    const result = await internal.tryRouter({ row: baseRow, intent: "greeting", knowledge: undefined, verifiedFacts: undefined, messageText: "Oi" });
    expect(result.kind).toBe("regex_fallback");
    expect((result as { reason?: string }).reason).toBe("api_key_missing");
    // Budget untouched on the api_key_missing path.
    expect(internal.tokenBudgetUsed).toBe(0);
  });

  it("reports the BRT date even when the UTC date differs", () => {
    const worker = buildWorker();
    const internal = asInternal(worker);
    // 02:30 UTC on 2026-01-01 is 23:30 BRT on 2025-12-31.
    const date = new Date("2026-01-01T02:30:00.000Z");
    expect(internal.currentBrDay(date)).toBe("2025-12-31");
    // 03:00 UTC is midnight BRT — the day flips forward.
    const midnight = new Date("2026-01-01T03:00:00.000Z");
    expect(internal.currentBrDay(midnight)).toBe("2026-01-01");
  });
});
