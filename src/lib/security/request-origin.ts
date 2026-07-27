export class UntrustedOriginError extends Error {
  constructor() { super("UNTRUSTED_ORIGIN"); this.name = "UntrustedOriginError"; }
}

type OriginEnvironment = Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "PORTAL_BASE_URL" | "TRUST_PROXY">>;

function configuredOrigin(environment: OriginEnvironment): string | null {
  if (!environment.PORTAL_BASE_URL) return null;
  try { return new URL(environment.PORTAL_BASE_URL).origin; } catch { throw new UntrustedOriginError(); }
}

export function effectiveRequestOrigin(request: Request, environment: OriginEnvironment = process.env): string {
  const direct = new URL(request.url).origin;
  if (environment.TRUST_PROXY !== "true") return direct;
  const expected = configuredOrigin(environment);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (!expected || !forwardedHost || forwardedProto !== "https") throw new UntrustedOriginError();
  const forwarded = new URL(`${forwardedProto}://${forwardedHost}`).origin;
  if (forwarded !== expected) throw new UntrustedOriginError();
  return forwarded;
}

export function assertTrustedMutation(request: Request, environment: OriginEnvironment = process.env) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") throw new UntrustedOriginError();
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== effectiveRequestOrigin(request, environment)) throw new UntrustedOriginError();
}
