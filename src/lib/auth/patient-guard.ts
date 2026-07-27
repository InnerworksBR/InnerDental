import "server-only";

import { cookies } from "next/headers";
import { readSession, sessionCookieName } from "@/lib/auth/session";

export async function requirePatientSession(): Promise<{ phone: string; sessionId: string }> {
  const session = readSession((await cookies()).get(sessionCookieName)?.value);
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}
