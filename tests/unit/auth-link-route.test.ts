import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeAccessToken: vi.fn(),
  createSession: vi.fn(() => "signed-session"),
  hashAccessToken: vi.fn((token: string) => `hash:${token}`),
}));

vi.mock("@/lib/auth/access-token-repository", () => ({ consumeAccessToken: mocks.consumeAccessToken }));
vi.mock("@/lib/auth/access-token", () => ({ hashAccessToken: mocks.hashAccessToken }));
vi.mock("@/lib/auth/session", () => ({ createSession: mocks.createSession, sessionCookieName: "luna_session" }));

import { GET } from "@/app/api/auth/link/route";

const publicOrigin = "https://agenda.example";

function proxiedRequest(path: string, forwardedHost = "agenda.example") {
  return new Request(`http://0.0.0.0:3000${path}`, {
    headers: { "x-forwarded-host": forwardedHost, "x-forwarded-proto": "https" },
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PORTAL_BASE_URL", publicOrigin);
  vi.stubEnv("TRUST_PROXY", "true");
  mocks.consumeAccessToken.mockReset();
  mocks.createSession.mockClear();
  mocks.hashAccessToken.mockClear();
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/auth/link behind a trusted proxy", () => {
  it("redirects a valid one-time token to the public agenda and creates the session", async () => {
    mocks.consumeAccessToken.mockResolvedValue({ phone: "5513000000000", sessionId: null });

    const response = await GET(proxiedRequest("/api/auth/link?token=opaque-token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${publicOrigin}/agenda`);
    expect(response.headers.get("set-cookie")).toContain("luna_session=signed-session");
    expect(mocks.consumeAccessToken).toHaveBeenCalledWith("hash:opaque-token");
  });

  it("keeps invalid and consumed-token redirects on the public origin", async () => {
    const missing = await GET(proxiedRequest("/api/auth/link"));
    mocks.consumeAccessToken.mockResolvedValue(null);
    const consumed = await GET(proxiedRequest("/api/auth/link?token=consumed-token"));

    expect(missing.headers.get("location")).toBe(`${publicOrigin}/acesso?erro=link-invalido`);
    expect(consumed.headers.get("location")).toBe(`${publicOrigin}/acesso?erro=link-expirado`);
  });

  it("rejects a forged forwarded host before consuming the token", async () => {
    const response = await GET(proxiedRequest("/api/auth/link?token=opaque-token", "evil.example"));

    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.consumeAccessToken).not.toHaveBeenCalled();
  });
});
