import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the worker feature-flag env-var parsing introduced in PR 5.
 *
 * These tests isolate `parseLlmRoutingMode` (the small helper inside
 * `worker/index.ts`) by re-implementing it here. Keeping a parallel
 * implementation would defeat the test, so instead we import the worker
 * module to read the helper. The worker module pulls in heavy integrations
 * (Supabase, Evolution, Google Calendar auth) that fail without real
 * credentials, so we import the helper through a thin re-export instead.
 *
 * Implementation strategy: extract the pure parsing logic by re-reading the
 * function from the worker source. Since the helper is local (not exported),
 * we drive the integration through `loadWorkerConfig()` with a controlled
 * env. `loadWorkerConfig` also requires a baseline of env vars, so we provide
 * the minimum needed and verify the parsed value via the returned `Config`.
 */

import { loadWorkerConfig } from "../../worker/index";

const baseEnv = {
  OTP_ENCRYPTION_SECRET: "unit-test-otp-secret-that-is-at-least-thirty-two-characters",
  PORTAL_BASE_URL: "https://agenda.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SECRET_KEY: "server-secret",
  EVOLUTION_BASE_URL: "https://evolution.example",
  EVOLUTION_API_KEY: "evolution-key",
  EVOLUTION_INSTANCE: "instance",
  WORKER_RECIPIENT_POLICY: "allowlist",
  WORKER_ALLOWED_RECIPIENTS: "5513999999999",
  HANDOFF_NOTIFICATION_PHONE: "5513999999999",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "agent@example.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDfake\n-----END PRIVATE KEY-----\n",
};

const withEnv = (overrides: Record<string, string | undefined>) => {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
};

describe("WORKER_LLM_ROUTING_ENABLED parsing", () => {
  beforeEach(() => {
    for (const key of Object.keys(baseEnv)) process.env[key] = baseEnv[key];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of Object.keys(baseEnv)) delete process.env[key];
  });

  it("parses 'true' to the 'llm' mode", () => {
    const restore = withEnv({ WORKER_LLM_ROUTING_ENABLED: "true", OPENAI_API_KEY: "missing" });
    try {
      const config = loadWorkerConfig();
      expect(config.llmRouting).toBe("llm");
    } finally { restore(); }
  });

  it("parses 'shadow' to the 'shadow' mode", () => {
    const restore = withEnv({ WORKER_LLM_ROUTING_ENABLED: "shadow" });
    try {
      const config = loadWorkerConfig();
      expect(config.llmRouting).toBe("shadow");
    } finally { restore(); }
  });

  it("parses 'regex_only' to the 'regex_only' mode", () => {
    const restore = withEnv({ WORKER_LLM_ROUTING_ENABLED: "regex_only" });
    try {
      const config = loadWorkerConfig();
      expect(config.llmRouting).toBe("regex_only");
    } finally { restore(); }
  });

  it("defaults to 'off' when the variable is absent", () => {
    const restore = withEnv({ WORKER_LLM_ROUTING_ENABLED: undefined });
    try {
      const config = loadWorkerConfig();
      expect(config.llmRouting).toBe("off");
    } finally { restore(); }
  });

  it("parses 'true' to 'llm' even when OPENAI_API_KEY is missing (PR 6 will refuse to run LLM)", () => {
    const restore = withEnv({ WORKER_LLM_ROUTING_ENABLED: "true", OPENAI_API_KEY: undefined });
    try {
      const config = loadWorkerConfig();
      expect(config.llmRouting).toBe("llm");
      expect(config.openaiApiKey).toBeUndefined();
    } finally { restore(); }
  });

  it("throws WORKER_LLM_ROUTING_ENABLED_INVALID on unrecognized values", () => {
    const restore = withEnv({ WORKER_LLM_ROUTING_ENABLED: "enabled" });
    try {
      expect(() => loadWorkerConfig()).toThrow("WORKER_LLM_ROUTING_ENABLED_INVALID");
    } finally { restore(); }
  });

  it("parses 'false' to 'off' for backward compatibility", () => {
    const restore = withEnv({ WORKER_LLM_ROUTING_ENABLED: "false" });
    try {
      const config = loadWorkerConfig();
      expect(config.llmRouting).toBe("off");
    } finally { restore(); }
  });
});

describe("OPENAI_ROUTING_* env var parsing", () => {
  beforeEach(() => {
    for (const key of Object.keys(baseEnv)) process.env[key] = baseEnv[key];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of Object.keys(baseEnv)) delete process.env[key];
  });

  it("uses OPENAI_ROUTING_MODEL when provided, else falls back to OPENAI_CHAT_MODEL, else to gpt-4o-mini", () => {
    const restore1 = withEnv({ WORKER_LLM_ROUTING_ENABLED: "off", OPENAI_ROUTING_MODEL: "gpt-4.1-mini", OPENAI_CHAT_MODEL: undefined });
    try { expect(loadWorkerConfig().openaiRoutingModel).toBe("gpt-4.1-mini"); } finally { restore1(); }

    const restore2 = withEnv({ WORKER_LLM_ROUTING_ENABLED: "off", OPENAI_ROUTING_MODEL: undefined, OPENAI_CHAT_MODEL: "gpt-4o" });
    try { expect(loadWorkerConfig().openaiRoutingModel).toBe("gpt-4o"); } finally { restore2(); }

    const restore3 = withEnv({ WORKER_LLM_ROUTING_ENABLED: "off", OPENAI_ROUTING_MODEL: undefined, OPENAI_CHAT_MODEL: undefined });
    try { expect(loadWorkerConfig().openaiRoutingModel).toBe("gpt-4o-mini"); } finally { restore3(); }
  });

  it("defaults OPENAI_ROUTING_TIMEOUT_MS to 4000 and rejects out-of-range values", () => {
    const restore1 = withEnv({ WORKER_LLM_ROUTING_ENABLED: "off", OPENAI_ROUTING_TIMEOUT_MS: undefined });
    try { expect(loadWorkerConfig().openaiRoutingTimeoutMs).toBe(4000); } finally { restore1(); }

    const restore2 = withEnv({ WORKER_LLM_ROUTING_ENABLED: "off", OPENAI_ROUTING_TIMEOUT_MS: "100" });
    try { expect(() => loadWorkerConfig()).toThrow("OPENAI_ROUTING_TIMEOUT_MS_INVALID"); } finally { restore2(); }

    const restore3 = withEnv({ WORKER_LLM_ROUTING_ENABLED: "off", OPENAI_ROUTING_TIMEOUT_MS: "99999" });
    try { expect(() => loadWorkerConfig()).toThrow("OPENAI_ROUTING_TIMEOUT_MS_INVALID"); } finally { restore3(); }
  });

  it("defaults OPENAI_ROUTING_MAX_RETRIES to 1 and rejects out-of-range values", () => {
    const restore1 = withEnv({ WORKER_LLM_ROUTING_ENABLED: "off", OPENAI_ROUTING_MAX_RETRIES: undefined });
    try { expect(loadWorkerConfig().openaiRoutingMaxRetries).toBe(1); } finally { restore1(); }

    const restore2 = withEnv({ WORKER_LLM_ROUTING_ENABLED: "off", OPENAI_ROUTING_MAX_RETRIES: "-1" });
    try { expect(() => loadWorkerConfig()).toThrow("OPENAI_ROUTING_MAX_RETRIES_INVALID"); } finally { restore2(); }

    const restore3 = withEnv({ WORKER_LLM_ROUTING_ENABLED: "off", OPENAI_ROUTING_MAX_RETRIES: "4" });
    try { expect(() => loadWorkerConfig()).toThrow("OPENAI_ROUTING_MAX_RETRIES_INVALID"); } finally { restore3(); }
  });

  it("defaults OPENAI_ROUTING_DAILY_TOKEN_BUDGET to 200000 and rejects non-positive integers", () => {
    const restore1 = withEnv({ WORKER_LLM_ROUTING_ENABLED: "off", OPENAI_ROUTING_DAILY_TOKEN_BUDGET: undefined });
    try { expect(loadWorkerConfig().openaiRoutingDailyTokenBudget).toBe(200000); } finally { restore1(); }

    const restore2 = withEnv({ WORKER_LLM_ROUTING_ENABLED: "off", OPENAI_ROUTING_DAILY_TOKEN_BUDGET: "0" });
    try { expect(() => loadWorkerConfig()).toThrow("OPENAI_ROUTING_DAILY_TOKEN_BUDGET_INVALID"); } finally { restore2(); }

    const restore3 = withEnv({ WORKER_LLM_ROUTING_ENABLED: "off", OPENAI_ROUTING_DAILY_TOKEN_BUDGET: "not-a-number" });
    try { expect(() => loadWorkerConfig()).toThrow("OPENAI_ROUTING_DAILY_TOKEN_BUDGET_INVALID"); } finally { restore3(); }
  });
});
