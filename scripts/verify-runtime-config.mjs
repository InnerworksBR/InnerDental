const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "AUTH_SESSION_SECRET", "PORTAL_BASE_URL", "METRICS_TOKEN"];
const missing = required.filter((name) => !process.env[name]?.trim());
const problems = missing.map((name) => `${name}:missing`);
try {
  const portal = new URL(process.env.PORTAL_BASE_URL ?? "");
  if (process.env.NODE_ENV === "production" && (portal.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(portal.hostname))) problems.push("PORTAL_BASE_URL:not_public_https");
} catch { problems.push("PORTAL_BASE_URL:invalid"); }
if ((process.env.AUTH_SESSION_SECRET?.length ?? 0) < 32) problems.push("AUTH_SESSION_SECRET:too_short");
if ((process.env.METRICS_TOKEN?.length ?? 0) < 24) problems.push("METRICS_TOKEN:too_short");
if (process.env.NODE_ENV === "production" && process.env.TRUST_PROXY !== "true") problems.push("TRUST_PROXY:required");
if (problems.length) { console.error(`Runtime configuration invalid: ${problems.join(", ")}`); process.exit(1); }
console.log(`Runtime configuration valid for ${process.env.SERVICE_NAME ?? "luna-web"}.`);
