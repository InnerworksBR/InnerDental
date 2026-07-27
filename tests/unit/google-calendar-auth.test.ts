import { generateKeyPairSync, verify as verifySignature } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CalendarUnavailableError } from "@/domain/availability/service";
import {
  getGoogleCalendarAccessToken,
  GoogleServiceAccountAuth,
  normalizeGooglePrivateKey,
  readGoogleServiceAccountCredentials,
} from "@/integrations/google-calendar/auth";

function decodeJson(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
}
const privateKeyMarker = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
const privateKeyEndMarker = ["-----END", "PRIVATE KEY-----"].join(" ");

describe("GoogleServiceAccountAuth", () => {
  it("normalizes escaped newlines from environment secrets", () => {
    expect(normalizeGooglePrivateKey(`${privateKeyMarker}\\nsecret\\n${privateKeyEndMarker}\\n`))
      .toBe(`${privateKeyMarker}\nsecret\n${privateKeyEndMarker}\n`);
  });

  it("reads the required service account credentials without exposing them", () => {
    const credentials = readGoogleServiceAccountCredentials({
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "calendar@example.iam.gserviceaccount.com",
      GOOGLE_PRIVATE_KEY: `${privateKeyMarker}\\nsecret\\n${privateKeyEndMarker}`,
    });

    expect(credentials.serviceAccountEmail).toBe("calendar@example.iam.gserviceaccount.com");
    expect(credentials.privateKey).toContain("\nsecret\n");
  });

  it("signs the OAuth assertion and caches the access token", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2_048 });
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const now = 1_800_000_000_000;
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const parameters = new URLSearchParams(String(init?.body));
      const assertion = parameters.get("assertion");
      expect(parameters.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
      expect(assertion).toBeTruthy();

      const [header, claims, signature] = assertion!.split(".");
      expect(decodeJson(header)).toEqual({ alg: "RS256", typ: "JWT" });
      expect(decodeJson(claims)).toEqual({
        iss: "calendar@example.iam.gserviceaccount.com",
        scope: "https://www.googleapis.com/auth/calendar",
        aud: "https://oauth2.googleapis.com/token",
        iat: Math.floor(now / 1_000),
        exp: Math.floor(now / 1_000) + 3_600,
      });
      expect(verifySignature(
        "RSA-SHA256",
        Buffer.from(`${header}.${claims}`),
        publicKey,
        Buffer.from(signature, "base64url"),
      )).toBe(true);

      return new Response(JSON.stringify({
        access_token: "temporary-access-token",
        expires_in: 3_600,
        token_type: "Bearer",
      }), { status: 200 });
    });
    const auth = new GoogleServiceAccountAuth({
      serviceAccountEmail: "calendar@example.iam.gserviceaccount.com",
      privateKey: privateKeyPem,
    }, fetcher as typeof fetch, () => now);

    await expect(auth.getAccessToken()).resolves.toBe("temporary-access-token");
    await expect(auth.getAccessToken()).resolves.toBe("temporary-access-token");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails closed when service account configuration is absent", async () => {
    await expect(getGoogleCalendarAccessToken({})).rejects.toBeInstanceOf(CalendarUnavailableError);
  });
});
