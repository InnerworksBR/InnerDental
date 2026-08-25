import { describe, expect, it } from "vitest";
import {
  ROUTER_TOOLS,
  ROUTER_TOOL_NAMES,
  allowedToolsFor,
  executeRouterTool,
  validateToolArguments,
  type RouterToolContext,
} from "@/domain/messaging/router-tools";
import type { ToolName } from "@/integrations/openai/router-types";

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

/** Minimal context used by stub executors (they ignore it). */
const stubContext: RouterToolContext = {
  phone: "5513999999999",
  inboxId: "inbox-stub",
  // `SupabaseClient` and `EvolutionClient` are not exercised by stubs.
  supabase: {} as RouterToolContext["supabase"],
  evolution: {} as RouterToolContext["evolution"],
  knowledge: { plans: [], aliases: [], procedures: [], faqs: [] },
  slots: {},
};

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

describe("executeRouterTool", () => {
  it("returns a stub placeholder reply for every registered tool", async () => {
    for (const name of EXPECTED_TOOL_NAMES) {
      const result = await executeRouterTool(name, {}, stubContext);
      expect(result.reply).toBe(`__stub__:${name}`);
    }
  });

  it("flags handoff via the dedicated stub", async () => {
    const result = await executeRouterTool("handoff", {}, stubContext);
    expect(result.reply).toBe("__stub__:handoff");
    expect(result.handoff).toBe(true);
  });

  it("does not throw for tools that ignore their argument bag", async () => {
    await expect(executeRouterTool("greet", {}, stubContext)).resolves.toBeDefined();
    await expect(executeRouterTool("answer_plan", { plan_id: "rede-unna", extra: "ignored" }, stubContext)).resolves.toBeDefined();
  });
});

describe("module load", () => {
  it("does not throw when imported (registry covers every ToolName)", () => {
    // The throw-on-missing check runs at module evaluation. Reaching this
    // test means the module loaded successfully and the registry is full.
    expect(EXPECTED_TOOL_NAMES).toHaveLength(18);
  });
});