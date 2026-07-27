import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeAccessToken: vi.fn(),
  createSession: vi.fn(() => "signed-session"),
  hashAccessToken: vi.fn((token: string) => `hash:${token}`),
}));

vi.mock("@/lib/auth/access-token-repository", () => ({ consumeAccessToken: mocks.consumeAccessToken }));
vi.mock("@/lib/auth/access-token", () => ({ hashAccessToken: mocks.hashAccessToken }));
vi.mock("@/lib/auth/session", () => ({ createSession: mocks.createSession, sessionCookieName: "luna_session" }));

import { GET, POST } from "@/app/api/auth/link/route";

const publicOrigin = "https://agenda.example";

function proxiedRequest(path: string, init?: RequestInit, forwardedHost = "agenda.example") {
  return new Request(`http://0.0.0.0:3000${path}`, {
    ...init,
    headers: {
      "x-forwarded-host": forwardedHost,
      "x-forwarded-proto": "https",
      ...init?.headers,
    },
  });
}

function redemptionRequest(token: string, forwardedHost = "agenda.example") {
  return proxiedRequest("/api/auth/link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: publicOrigin,
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ token }),
  }, forwardedHost);
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
  it("moves a legacy query token to the browser fragment without consuming it", async () => {
    const response = await GET(proxiedRequest("/api/auth/link?token=opaque-token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${publicOrigin}/acesso#token=opaque-token`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.consumeAccessToken).not.toHaveBeenCalled();
    expect(mocks.hashAccessToken).not.toHaveBeenCalled();
  });

  it("keeps missing-token redirects on the public origin", async () => {
    const response = await GET(proxiedRequest("/api/auth/link"));

    expect(response.headers.get("location")).toBe(`${publicOrigin}/acesso?erro=link-invalido`);
    expect(mocks.consumeAccessToken).not.toHaveBeenCalled();
  });

  it("rejects a forged forwarded host", async () => {
    const response = await GET(proxiedRequest("/api/auth/link?token=opaque-token", undefined, "evil.example"));

    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.consumeAccessToken).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/link behind a trusted proxy", () => {
  it("redeems the token after an explicit same-origin browser request", async () => {
    mocks.consumeAccessToken.mockResolvedValue({ phone: "5513000000000", sessionId: null });

    const response = await POST(redemptionRequest("opaque-token"));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("luna_session=signed-session");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.consumeAccessToken).toHaveBeenCalledWith("hash:opaque-token");
  });

  it("rejects an invalid or already consumed token", async () => {
    mocks.consumeAccessToken.mockResolvedValue(null);

    const response = await POST(redemptionRequest("consumed-token"));

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a forged origin before consuming the token", async () => {
    const request = proxiedRequest("/api/auth/link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "https://evil.example",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ token: "opaque-token" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mocks.consumeAccessToken).not.toHaveBeenCalled();
  });
});
