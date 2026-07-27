import { describe, expect, it } from "vitest";
import { assertTrustedMutation, effectiveRequestOrigin, UntrustedOriginError } from "@/lib/security/request-origin";

describe("mutation origin protection", () => {
  it("accepts same-origin browser requests", () => expect(() => assertTrustedMutation(new Request("https://agenda.example/api/test", { headers: { origin: "https://agenda.example", "sec-fetch-site": "same-origin" } }))).not.toThrow());
  it("rejects cross-site browser requests", () => expect(() => assertTrustedMutation(new Request("https://agenda.example/api/test", { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } }))).toThrow(UntrustedOriginError));
  it("accepts only the configured HTTPS edge when proxy trust is enabled", () => {
    const request = new Request("http://web:3000/api/test", { headers: { origin: "https://agenda.example", "x-forwarded-host": "agenda.example", "x-forwarded-proto": "https" } });
    const environment = { NODE_ENV: "production", PORTAL_BASE_URL: "https://agenda.example", TRUST_PROXY: "true" };
    expect(effectiveRequestOrigin(request, environment)).toBe("https://agenda.example");
    expect(() => assertTrustedMutation(request, environment)).not.toThrow();
  });
  it("rejects forged forwarded hosts", () => {
    const request = new Request("http://web:3000/api/test", { headers: { origin: "https://evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" } });
    expect(() => assertTrustedMutation(request, { NODE_ENV: "production", PORTAL_BASE_URL: "https://agenda.example", TRUST_PROXY: "true" })).toThrow(UntrustedOriginError);
  });
});
