import "server-only";

import { createHash, createSign } from "node:crypto";
import { CalendarUnavailableError } from "@/domain/availability/service";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export type GoogleServiceAccountCredentials = {
  serviceAccountEmail: string;
  privateKey: string;
};

type GoogleTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
};

type CachedToken = {
  value: string;
  expiresAt: number;
};

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function normalizeGooglePrivateKey(value: string): string {
  const trimmed = value.trim();
  const unquoted = (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) ? trimmed.slice(1, -1) : trimmed;
  return unquoted.replace(/\\n/g, "\n");
}

export function readGoogleServiceAccountCredentials(
  environment: NodeJS.ProcessEnv = process.env,
): GoogleServiceAccountCredentials {
  const serviceAccountEmail = environment.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  const privateKey = normalizeGooglePrivateKey(environment.GOOGLE_PRIVATE_KEY ?? "");

  if (!serviceAccountEmail || !privateKey || !privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Google Calendar service account is not configured");
  }

  return { serviceAccountEmail, privateKey };
}

export function googleCalendarAuthConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  try {
    readGoogleServiceAccountCredentials(environment);
    return true;
  } catch {
    return false;
  }
}

export class GoogleServiceAccountAuth {
  private cachedToken?: CachedToken;
  private pendingToken?: Promise<CachedToken>;

  constructor(
    private readonly credentials: GoogleServiceAccountCredentials,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly timeoutMs = 2_500,
  ) {}

  async getAccessToken(): Promise<string> {
    const now = this.now();
    if (this.cachedToken && this.cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > now) {
      return this.cachedToken.value;
    }

    if (!this.pendingToken) {
      this.pendingToken = this.exchangeToken().finally(() => {
        this.pendingToken = undefined;
      });
    }

    this.cachedToken = await this.pendingToken;
    return this.cachedToken.value;
  }

  private async exchangeToken(): Promise<CachedToken> {
    const issuedAt = Math.floor(this.now() / 1_000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64Url(JSON.stringify({
      iss: this.credentials.serviceAccountEmail,
      scope: GOOGLE_CALENDAR_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3_600,
    }));
    const unsignedAssertion = `${header}.${claims}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsignedAssertion);
    signer.end();
    const assertion = `${unsignedAssertion}.${signer.sign(this.credentials.privateKey).toString("base64url")}`;

    const response = await this.fetcher(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) throw new Error("Google OAuth token exchange failed");
    const body = await response.json() as GoogleTokenResponse;
    if (typeof body.access_token !== "string" || typeof body.expires_in !== "number" || body.expires_in <= 0) {
      throw new Error("Google OAuth token response is invalid");
    }

    return {
      value: body.access_token,
      expiresAt: this.now() + body.expires_in * 1_000,
    };
  }
}

let defaultAuth: GoogleServiceAccountAuth | undefined;
let defaultCredentialFingerprint: string | undefined;

export async function getGoogleCalendarAccessToken(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  try {
    const credentials = readGoogleServiceAccountCredentials(environment);
    const fingerprint = createHash("sha256")
      .update(credentials.serviceAccountEmail)
      .update("\0")
      .update(credentials.privateKey)
      .digest("hex");

    if (!defaultAuth || defaultCredentialFingerprint !== fingerprint) {
      defaultAuth = new GoogleServiceAccountAuth(credentials);
      defaultCredentialFingerprint = fingerprint;
    }

    return await defaultAuth.getAccessToken();
  } catch {
    throw new CalendarUnavailableError();
  }
}
