import "server-only";

import { createHash } from "node:crypto";
import { CalendarUnavailableError } from "./error.ts";
import {
  GoogleServiceAccountAuth,
  readGoogleServiceAccountCredentials,
} from "./service-account-auth.ts";

export {
  GoogleServiceAccountAuth,
  googleCalendarAuthConfigured,
  normalizeGooglePrivateKey,
  readGoogleServiceAccountCredentials,
  type GoogleServiceAccountCredentials,
} from "./service-account-auth.ts";

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
