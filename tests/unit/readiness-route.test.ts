import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  databaseConnection: vi.fn(),
  routingSchema: vi.fn(),
  calendar: vi.fn(),
  openai: vi.fn(),
  evolution: vi.fn(),
  log: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ limit: mocks.databaseConnection }) }),
    rpc: mocks.routingSchema,
  }),
}));
vi.mock("@/integrations/google-calendar/auth", () => ({ getGoogleCalendarAccessToken: mocks.calendar }));
vi.mock("@/integrations/openai/readiness", () => ({ openAIReady: mocks.openai }));
vi.mock("@/integrations/evolution/client", () => ({
  EvolutionClient: class { connectionState() { return mocks.evolution(); } },
}));
vi.mock("@/lib/observability/logger", () => ({ log: mocks.log }));

import { GET } from "@/app/api/health/ready/route";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PORTAL_BASE_URL", "https://agenda.example");
  vi.stubEnv("EVOLUTION_BASE_URL", "https://evolution.example");
  vi.stubEnv("EVOLUTION_API_KEY", "test-key");
  vi.stubEnv("EVOLUTION_INSTANCE", "luna");
  vi.stubEnv("OTP_ENCRYPTION_SECRET", "a-secret-with-at-least-thirty-two-characters");
  vi.stubEnv("OPENAI_API_KEY", "");
  mocks.databaseConnection.mockResolvedValue({ data: [], error: null });
  mocks.routingSchema.mockResolvedValue({ data: true, error: null });
  mocks.calendar.mockResolvedValue("calendar-token");
  mocks.openai.mockResolvedValue(false);
  mocks.evolution.mockResolvedValue("open");
  mocks.log.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health/ready", () => {
  it("is ready with deterministic routing installed and OpenAI disabled", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      status: "ready",
      dependencies: expect.objectContaining({ database: "ok", openai: "disabled" }),
    }));
    expect(mocks.routingSchema).toHaveBeenCalledWith("whatsapp_routing_schema_ready");
  });

  it("fails closed when the routing schema RPC is missing or incompatible", async () => {
    mocks.routingSchema.mockResolvedValue({ data: null, error: { code: "PGRST202" } });

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      status: "not_ready",
      dependencies: expect.objectContaining({ database: "schema_unavailable", openai: "disabled" }),
    }));
  });
});
