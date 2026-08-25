import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIRouterError, routeWithTools, routerDecisionSchema, validateRouterDecision } from "@/integrations/openai/chat";
import type { RoutingContext } from "@/integrations/openai/router-types";

const baseContext: RoutingContext = {
  phone: "5513999999999",
  slots: {},
  recent_turns: [],
  knowledge: { plans: [], aliases: [], procedures: [], coverage: [], faqs: [] },
};

const buildContext = (overrides: Partial<RoutingContext> = {}): RoutingContext => ({ ...baseContext, ...overrides });

const okResponse = (calls: unknown, usage?: { input_tokens?: number; output_tokens?: number }) =>
  new Response(
    JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ calls }) }] }],
      usage,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

describe("routeWithTools", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the parsed decision and token usage on a happy path", async () => {
    const fetcher = vi.fn().mockResolvedValue(okResponse([{ name: "request_scheduling_link", arguments: { kind: "schedule" } }], { input_tokens: 100, output_tokens: 50 }));
    vi.stubGlobal("fetch", fetcher);
    const result = await routeWithTools({ apiKey: "test-key", model: "gpt-4o-mini", context: buildContext(), toolSchemas: [] });
    expect(result.decision).toEqual({ calls: [{ name: "request_scheduling_link", arguments: { kind: "schedule" } }] });
    expect(result.tokensIn).toBe(100);
    expect(result.tokensOut).toBe(50);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(request.model).toBe("gpt-4o-mini");
    expect(request.temperature).toBe(0);
    expect(request.store).toBe(false);
    expect(request.max_output_tokens).toBe(200);
    expect(request.instructions).toContain("nao confiavel");
    expect(request.text.format.name).toBe("router_decision");
    expect(request.text.format.strict).toBe(true);
    expect(request.text.format.schema.properties.calls.maxItems).toBe(4);
    expect(request.text.format.schema.properties.calls.minItems).toBe(1);
    expect(request.text.format.schema.properties.calls.items.properties.name.enum).toContain("request_scheduling_link");
    const payload = JSON.parse(request.input);
    expect(payload).toEqual(expect.objectContaining({ context: expect.objectContaining({ phone: "5513999999999" }) }));
  });

  it("throws OPENAI_SCHEMA_INVALID when the calls array is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([])));
    await expect(routeWithTools({ apiKey: "test-key", model: "gpt-4o-mini", context: buildContext(), toolSchemas: [] }))
      .rejects.toBeInstanceOf(OpenAIRouterError);
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([])));
    await expect(routeWithTools({ apiKey: "test-key", model: "gpt-4o-mini", context: buildContext(), toolSchemas: [] }))
      .rejects.toMatchObject({ code: "OPENAI_SCHEMA_INVALID" });
  });

  it("throws OPENAI_SCHEMA_INVALID when a tool name is not in the enum (Zod catch)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([{ name: "drop_database", arguments: {} }])));
    await expect(routeWithTools({ apiKey: "test-key", model: "gpt-4o-mini", context: buildContext(), toolSchemas: [] }))
      .rejects.toMatchObject({ code: "OPENAI_SCHEMA_INVALID" });
  });

  it("retries once on 429 and surfaces OPENAI_UNREACHABLE if the retry also fails", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(routeWithTools({ apiKey: "test-key", model: "gpt-4o-mini", context: buildContext(), toolSchemas: [] }))
      .rejects.toMatchObject({ code: "OPENAI_UNREACHABLE" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("retries once on 500 and surfaces OPENAI_UNREACHABLE if the retry also fails", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(routeWithTools({ apiKey: "test-key", model: "gpt-4o-mini", context: buildContext(), toolSchemas: [] }))
      .rejects.toMatchObject({ code: "OPENAI_UNREACHABLE" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("succeeds on the second attempt when the first attempt returns 500", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("boom", { status: 503 }))
      .mockResolvedValueOnce(okResponse([{ name: "greet", arguments: {} }]));
    vi.stubGlobal("fetch", fetcher);
    const result = await routeWithTools({ apiKey: "test-key", model: "gpt-4o-mini", context: buildContext(), toolSchemas: [] });
    expect(result.decision).toEqual({ calls: [{ name: "greet", arguments: {} }] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("throws OPENAI_TIMEOUT when the request exceeds the per-attempt timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn().mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }));
      vi.stubGlobal("fetch", fetcher);
      const promise = routeWithTools({ apiKey: "test-key", model: "gpt-4o-mini", context: buildContext(), toolSchemas: [], timeoutMs: 50, maxRetries: 0 });
      vi.advanceTimersByTime(50);
      await expect(promise).rejects.toMatchObject({ code: "OPENAI_TIMEOUT" });
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("throws OPENAI_EMPTY_DECISION when the response has no text content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "   " }] }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(routeWithTools({ apiKey: "test-key", model: "gpt-4o-mini", context: buildContext(), toolSchemas: [] }))
      .rejects.toMatchObject({ code: "OPENAI_EMPTY_DECISION" });
  });

  it("falls back to zero tokens when usage is absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ calls: [{ name: "greet", arguments: {} }] }) }] }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const result = await routeWithTools({ apiKey: "test-key", model: "gpt-4o-mini", context: buildContext(), toolSchemas: [] });
    expect(result.tokensIn).toBe(0);
    expect(result.tokensOut).toBe(0);
  });
});

describe("routerDecisionSchema", () => {
  it("accepts a single allowlisted tool call", () => {
    const parsed = routerDecisionSchema.parse({ calls: [{ name: "request_scheduling_link", arguments: { kind: "schedule" } }] });
    expect(parsed.calls).toHaveLength(1);
  });

  it("rejects an empty calls array", () => {
    expect(() => routerDecisionSchema.parse({ calls: [] })).toThrow();
  });

  it("rejects a tool outside the enum", () => {
    expect(() => routerDecisionSchema.parse({ calls: [{ name: "drop_table", arguments: {} }] })).toThrow();
  });
});

describe("validateRouterDecision", () => {
  it("returns valid:false UNKNOWN_TOOL for an unknown tool name", () => {
    const result = validateRouterDecision({ calls: [{ name: "unknown_tool" as never, arguments: {} }] }, buildContext());
    expect(result).toEqual({ valid: false, reason: "UNKNOWN_TOOL" });
  });

  it("returns valid:true for a fully allowlisted decision", () => {
    const result = validateRouterDecision({ calls: [{ name: "request_scheduling_link", arguments: { kind: "schedule" } }] }, buildContext());
    expect(result).toEqual({ valid: true });
  });
});