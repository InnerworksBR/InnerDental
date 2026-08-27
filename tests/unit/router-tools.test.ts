import { describe, expect, it, vi } from "vitest";
import {
  ROUTER_TOOLS,
  ROUTER_TOOL_NAMES,
  allowedToolsFor,
  executeRouterTool,
  validateToolArguments,
  type RouterToolContext,
} from "@/domain/messaging/router-tools";
import type { ToolName } from "@/integrations/openai/router-types";
import { encryptOtp } from "@/lib/messaging/otp-cipher";
import { createHash } from "node:crypto";

/**
 * The expected 18 tool names, matching `ToolName` in `router-types.ts`.
 * Kept in sync manually: if you add/remove a tool there, update this
 * array (and the registry + `ROUTER_TOOL_NAMES`) in the same PR.
 */
const EXPECTED_TOOL_NAMES: readonly ToolName[] = [
  "request_scheduling_link",
  "answer_plan",
  "answer_plan_list",
  "answer_procedure",
  "answer_procedure_list",
  "answer_coverage",
  "answer_child_policy",
  "answer_faq",
  "ask_plan",
  "accept_plan",
  "reject_plan",
  "ask_procedure",
  "confirm_attendance",
  "lookup_upcoming_appointment",
  "handoff",
  "greet",
  "send_questions_menu",
  "send_unsupported_media_reply",
];

/**
 * Minimal in-memory Supabase stub: only `rpc(name, args)` is used by the
 * executors today. Tests override it per scenario.
 */
function makeSupabase(rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>) {
  return { rpc } as unknown as RouterToolContext["supabase"];
}

/** Build a router context with overridable Supabase and knowledge. */
function makeContext(overrides: Partial<RouterToolContext> = {}): RouterToolContext {
  return {
    phone: "5513999999999",
    inboxId: "inbox-1",
    supabase: makeSupabase(async () => ({ data: null, error: null })),
    evolution: { sendText: vi.fn().mockResolvedValue(undefined), sendButtons: vi.fn().mockResolvedValue(undefined) } as never,
    knowledge: { plans: [], aliases: [], procedures: [], coverage: [], faqs: [] },
    slots: {},
    otpSecret: "a".repeat(32),
    portalBaseUrl: "https://agenda.example",
    ...overrides,
  };
}

/**
 * Returns the prepared-link payload shape the executor expects. The
 * `encrypted_token` must be a real AES-GCM ciphertext of a token whose
 * SHA-256 matches `token_hash` — otherwise `prepareInboxAccessLink` will
 * reject the round-trip with `OTP_CIPHERTEXT_INVALID`.
 */
function preparedAccessLink(secret = "a".repeat(32)) {
  const token = "test-token-123";
  const encrypted = encryptOtp(token, secret);
  const hash = createHash("sha256").update(token, "utf8").digest("hex");
  return {
    encrypted_token: encrypted,
    phone: "5513999999999",
    token_hash: hash,
    token_status: "active",
    expires_at: "2099-01-01T00:00:00.000Z",
    status: "prepared",
    sent_at: null,
  };
}

describe("router-tools registry", () => {
  it("covers every ToolName from router-types.ts", () => {
    expect(EXPECTED_TOOL_NAMES).toHaveLength(18);
    for (const name of EXPECTED_TOOL_NAMES) {
      expect(ROUTER_TOOLS[name]).toBeDefined();
      expect(ROUTER_TOOLS[name].name).toBe(name);
    }
    expect(Object.keys(ROUTER_TOOLS).sort()).toEqual([...EXPECTED_TOOL_NAMES].sort());
  });

  it("exports the canonical ordered list of tool names", () => {
    expect([...ROUTER_TOOL_NAMES]).toEqual([...EXPECTED_TOOL_NAMES]);
  });

  it("allows all 18 tools when routingMode is 'llm'", () => {
    expect(allowedToolsFor("llm")).toEqual([...EXPECTED_TOOL_NAMES]);
    expect(allowedToolsFor("llm")).toHaveLength(18);
  });

  it("allows all 18 tools when routingMode is 'shadow'", () => {
    expect(allowedToolsFor("shadow")).toEqual([...EXPECTED_TOOL_NAMES]);
    expect(allowedToolsFor("shadow")).toHaveLength(18);
  });

  it("allows zero tools when routingMode is 'regex_only'", () => {
    expect(allowedToolsFor("regex_only")).toEqual([]);
    expect(allowedToolsFor("regex_only")).toHaveLength(0);
  });

  it("allows zero tools when routingMode is 'off'", () => {
    expect(allowedToolsFor("off")).toEqual([]);
    expect(allowedToolsFor("off")).toHaveLength(0);
  });

  it("every tool has a non-empty description", () => {
    for (const name of EXPECTED_TOOL_NAMES) {
      const description = ROUTER_TOOLS[name].description;
      expect(typeof description).toBe("string");
      expect(description.trim().length).toBeGreaterThan(0);
    }
  });

  it("every tool declares additionalProperties:false in its parameters schema", () => {
    for (const name of EXPECTED_TOOL_NAMES) {
      const parameters = ROUTER_TOOLS[name].parameters;
      expect(parameters.type).toBe("object");
      expect(parameters.additionalProperties).toBe(false);
      expect(Array.isArray(parameters.required)).toBe(true);
      expect(typeof parameters.properties).toBe("object");
    }
  });

  it("every tool allows only 'llm' and 'shadow' routing modes", () => {
    for (const name of EXPECTED_TOOL_NAMES) {
      const modes = ROUTER_TOOLS[name].requires.routingMode;
      expect(modes.slice().sort()).toEqual(["llm", "shadow"]);
    }
  });
});

describe("validateToolArguments", () => {
  it("accepts an argument bag with the required keys present", () => {
    expect(validateToolArguments("answer_plan", { plan_id: "rede-unna" })).toEqual({ valid: true });
    expect(validateToolArguments("request_scheduling_link", { kind: "schedule" })).toEqual({ valid: true });
  });

  it("rejects missing required keys", () => {
    expect(validateToolArguments("answer_plan", {})).toEqual({ valid: false, reason: "MISSING_ARG:plan_id" });
    expect(validateToolArguments("reject_plan", { reason: "caixa" })).toEqual({ valid: true });
    expect(validateToolArguments("reject_plan", {})).toEqual({ valid: false, reason: "MISSING_ARG:reason" });
  });

  it("accepts empty arguments for no-argument tools", () => {
    expect(validateToolArguments("greet", {})).toEqual({ valid: true });
    expect(validateToolArguments("handoff", {})).toEqual({ valid: true });
  });
});

describe("executeRouterTool — knowledge-only executors", () => {
  it("answer_plan_list returns the canonical list message", async () => {
    const ctx = makeContext({
      knowledge: {
        plans: [{ id: "p1", name: "Plano A", instructions: null }, { id: "p2", name: "Plano B", instructions: null }],
        aliases: [], procedures: [], coverage: [], faqs: [],
      },
    });
    const result = await executeRouterTool("answer_plan_list", {}, ctx);
    expect(result.reply).toMatchObject({
      description: expect.stringContaining("Os planos ativos são: Plano A, Plano B"),
      fallbackText: expect.stringContaining("Os planos ativos são: Plano A, Plano B"),
    });
  });

  it("answer_plan returns the plan message when the id exists", async () => {
    const ctx = makeContext({
      knowledge: {
        plans: [{ id: "sulamerica", name: "SulAmérica", instructions: "Leve a carteirinha." }],
        aliases: [], procedures: [], coverage: [], faqs: [],
      },
    });
    const result = await executeRouterTool("answer_plan", { plan_id: "sulamerica" }, ctx);
    expect(result.reply).toMatchObject({
      description: expect.stringContaining("A clínica atende o plano SulAmérica"),
      fallbackText: expect.stringContaining("A clínica atende o plano SulAmérica"),
    });
  });

  it("answer_plan falls back gracefully when the id is unknown", async () => {
    const result = await executeRouterTool("answer_plan", { plan_id: "ghost" }, makeContext());
    expect(result.reply).toMatchObject({
      fallbackText: expect.stringContaining("Não localizei"),
    });
  });

  it("answer_procedure_list returns the canonical list", async () => {
    const ctx = makeContext({
      knowledge: {
        plans: [], aliases: [],
        procedures: [{ id: "limpeza", name: "Limpeza", description: "Avaliação.", online_booking: true }],
        coverage: [], faqs: [],
      },
    });
    const result = await executeRouterTool("answer_procedure_list", {}, ctx);
    expect(result.reply).toMatchObject({
      description: expect.stringContaining("Limpeza"),
    });
  });

  it("answer_procedure attaches an Agendar URL button when online_booking is true", async () => {
    const ctx = makeContext({
      knowledge: {
        plans: [], aliases: [],
        procedures: [{ id: "limpeza", name: "Limpeza", description: "Avaliação.", online_booking: true }],
        coverage: [], faqs: [],
      },
      supabase: makeSupabase(async (name) => {
        if (name === "prepare_whatsapp_access_link") return { data: preparedAccessLink(), error: null };
        return { data: null, error: null };
      }),
    });
    const result = await executeRouterTool("answer_procedure", { procedure_id: "limpeza" }, ctx);
    expect(result.reply).toMatchObject({
      buttons: expect.arrayContaining([expect.objectContaining({ type: "url", displayText: "Agendar avaliação" })]),
    });
    expect(result.inboxAccessLink?.url).toContain("https://agenda.example/acesso");
  });

  it("answer_child_policy picks the procedure whose name includes children/odontopediatria", async () => {
    const ctx = makeContext({
      knowledge: {
        plans: [], aliases: [],
        procedures: [{ id: "kids", name: "Crianças abaixo de 8 anos", description: "Não atende menores.", online_booking: false }],
        coverage: [], faqs: [],
      },
    });
    const result = await executeRouterTool("answer_child_policy", {}, ctx);
    expect(result.reply).toMatchObject({
      description: expect.stringContaining("Não atende menores"),
    });
  });

  it("greet returns the greeting interactive message", async () => {
    const result = await executeRouterTool("greet", {}, makeContext());
    expect(result.reply).toMatchObject({ title: expect.stringContaining("assistente da Luna") });
  });

  it("send_questions_menu returns the questions interactive message", async () => {
    const result = await executeRouterTool("send_questions_menu", {}, makeContext());
    expect(result.reply).toMatchObject({ title: expect.stringContaining("Planos e procedimentos") });
  });

  it("send_unsupported_media_reply returns the media warning", async () => {
    const result = await executeRouterTool("send_unsupported_media_reply", {}, makeContext());
    expect(result.reply).toMatchObject({ title: expect.stringContaining("Não consegui ler") });
  });

  it("handoff returns the handoff message and flags handoff=true", async () => {
    const result = await executeRouterTool("handoff", {}, makeContext());
    expect(result.handoff).toBe(true);
    expect(result.reply).toBe("Encaminhei sua mensagem para a equipe.");
  });
});

describe("executeRouterTool — slot-writing executors", () => {
  it("ask_plan returns the initial prompt and writes awaiting_plan slot", async () => {
    const result = await executeRouterTool("ask_plan", {}, makeContext());
    expect(result.reply).toBe("Qual é o seu plano odontológico?");
    expect(result.slotWrites).toEqual({ awaiting_plan: true, prompted_by_inbox_id: "inbox-1" });
  });

  it("ask_procedure returns the procedure prompt and writes awaiting_procedure slot", async () => {
    const result = await executeRouterTool("ask_procedure", {}, makeContext());
    expect(result.reply).toBe("Qual procedimento você gostaria de consultar?");
    expect(result.slotWrites).toEqual({ awaiting_procedure: true, prompted_by_inbox_id: "inbox-1" });
  });
});

describe("executeRouterTool — RPC-driven executors", () => {
  it("request_scheduling_link prepares an inbox link and returns the access interactive message", async () => {
    const ctx = makeContext({
      supabase: makeSupabase(async (name) => {
        if (name === "prepare_whatsapp_access_link") return { data: preparedAccessLink(), error: null };
        return { data: null, error: null };
      }),
    });
    const result = await executeRouterTool("request_scheduling_link", { kind: "reschedule" }, ctx);
    expect(result.reply).toMatchObject({
      title: "Remarcar consulta",
      buttons: expect.arrayContaining([expect.objectContaining({ type: "url" })]),
    });
    expect(result.inboxAccessLink?.url).toContain("https://agenda.example/acesso");
  });

  it("accept_plan calls accept_whatsapp_plan_triage with the migration 026 signature (no p_answer_inbox_id)", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const ctx = makeContext({
      slots: { prompted_by_inbox_id: "inbox-prompt" },
      supabase: makeSupabase(async (name, args) => {
        calls.push({ name, args });
        if (name === "accept_whatsapp_plan_triage") return { data: true, error: null };
        if (name === "prepare_whatsapp_access_link") return { data: preparedAccessLink(), error: null };
        return { data: null, error: null };
      }),
    });
    const result = await executeRouterTool("accept_plan", { plan_id: "rede-unna" }, ctx);
    const acceptCall = calls.find((c) => c.name === "accept_whatsapp_plan_triage");
    expect(acceptCall).toBeDefined();
    expect(acceptCall!.args).toEqual({
      p_phone: "5513999999999",
      p_insurance_plan_id: "rede-unna",
      p_prompted_by_inbox_id: "inbox-prompt",
    });
    // Migration 026 dropped `p_answer_inbox_id`; the executor must not send it.
    expect(acceptCall!.args).not.toHaveProperty("p_answer_inbox_id");
    expect(result.reply).toMatchObject({
      title: "Agendar consulta",
      buttons: expect.arrayContaining([expect.objectContaining({ type: "url" })]),
    });
  });

  it("accept_plan returns a soft retry without handoff when prompted_by_inbox_id is missing", async () => {
    const ctx = makeContext({
      supabase: makeSupabase(async () => ({ data: null, error: null })),
    });
    const result = await executeRouterTool("accept_plan", { plan_id: "rede-unna" }, ctx);
    expect(result.handoff).toBeUndefined();
    expect((result.reply as string)).toMatch(/Antes de confirmar/);
  });

  it("accept_plan falls back to a handoff when the RPC returns an error", async () => {
    const ctx = makeContext({
      slots: { prompted_by_inbox_id: "inbox-prompt" },
      supabase: makeSupabase(async () => ({ data: false, error: { message: "boom" } })),
    });
    const result = await executeRouterTool("accept_plan", { plan_id: "rede-unna" }, ctx);
    expect(result.handoff).toBe(true);
    expect(result.reply).toMatch(/equipe/);
  });

  it("reject_plan transitions the session and returns the matching message", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const ctx = makeContext({
      slots: { prompted_by_inbox_id: "inbox-prompt" },
      supabase: makeSupabase(async (name, args) => {
        calls.push({ name, args });
        return { data: true, error: null };
      }),
    });
    const result = await executeRouterTool("reject_plan", { reason: "caixa" }, ctx);
    expect(calls[0]?.name).toBe("transition_whatsapp_plan_triage");
    expect(calls[0]?.args).toEqual({
      p_phone: "5513999999999",
      p_action: "reject",
      p_pending_message: "",
      p_prompted_by_inbox_id: "inbox-prompt",
      p_expected_prompted_by_inbox_id: "inbox-prompt",
    });
    expect(result.reply).toBe("Planos com “Caixa” no nome não são mais atendidos pela clínica.");
  });

  it("reject_plan supports ambiguous and unsupported reasons", async () => {
    const ctx = makeContext({
      slots: { prompted_by_inbox_id: "inbox-prompt" },
      supabase: makeSupabase(async () => ({ data: true, error: null })),
    });
    const ambiguous = await executeRouterTool("reject_plan", { reason: "ambiguous" }, ctx);
    const unsupported = await executeRouterTool("reject_plan", { reason: "unsupported" }, ctx);
    expect(ambiguous.reply).toMatch(/mais de um plano/);
    expect(unsupported.reply).toMatch(/não está na nossa lista/);
  });

  it("reject_plan skips the RPC when prompted_by_inbox_id is missing (LLM should not call this here)", async () => {
    let rpcCalls = 0;
    const ctx = makeContext({
      supabase: makeSupabase(async () => { rpcCalls += 1; return { data: true, error: null }; }),
    });
    await executeRouterTool("reject_plan", { reason: "unsupported" }, ctx);
    expect(rpcCalls).toBe(0);
  });

  it("confirm_attendance returns the canonical message and the inbox link only when status needs a portal", async () => {
    const calls: Array<{ name: string }> = [];
    const ctx = makeContext({
      supabase: makeSupabase(async (name) => {
        calls.push({ name });
        if (name === "confirm_upcoming_appointment_by_phone") return { data: { status: "confirmed", start_at: "2099-02-01T10:00:00.000Z" }, error: null };
        if (name === "prepare_whatsapp_access_link") return { data: preparedAccessLink(), error: null };
        return { data: null, error: null };
      }),
    });
    const result = await executeRouterTool("confirm_attendance", {}, ctx);
    expect((result.reply as string)).toMatch(/Presença confirmada/);
    expect(result.inboxAccessLink).toBeUndefined();
    expect(calls.some((c) => c.name === "prepare_whatsapp_access_link")).toBe(false);
  });

  it("confirm_attendance asks for the portal when the RPC reports not_found", async () => {
    const ctx = makeContext({
      supabase: makeSupabase(async (name) => {
        if (name === "confirm_upcoming_appointment_by_phone") return { data: { status: "not_found" }, error: null };
        if (name === "prepare_whatsapp_access_link") return { data: preparedAccessLink(), error: null };
        return { data: null, error: null };
      }),
    });
    const result = await executeRouterTool("confirm_attendance", {}, ctx);
    expect(result.inboxAccessLink).toBeDefined();
    expect((result.reply as string)).toMatch(/Não encontrei uma consulta próxima/);
  });

  it("lookup_upcoming_appointment always returns an inbox link", async () => {
    const ctx = makeContext({
      supabase: makeSupabase(async (name) => {
        if (name === "get_upcoming_appointment_by_phone") return { data: { status: "not_found" }, error: null };
        if (name === "prepare_whatsapp_access_link") return { data: preparedAccessLink(), error: null };
        return { data: null, error: null };
      }),
    });
    const result = await executeRouterTool("lookup_upcoming_appointment", {}, ctx);
    expect(result.reply).toMatchObject({
      title: "Consulta não localizada",
      buttons: expect.arrayContaining([expect.objectContaining({ type: "url" })]),
    });
    expect(result.inboxAccessLink).toBeDefined();
  });
});

describe("module load", () => {
  it("does not throw when imported (registry covers every ToolName)", () => {
    expect(EXPECTED_TOOL_NAMES).toHaveLength(18);
  });
});