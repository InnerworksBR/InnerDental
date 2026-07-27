const baseUrl = process.env.SMOKE_BASE_URL;
if (!baseUrl) { console.error("SMOKE_BASE_URL is required"); process.exit(1); }
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 5000);
const checks = [{ path: "/api/health/live", expected: 200 }, { path: "/api/health/ready", expected: 200 }];
for (const check of checks) {
  const response = await fetch(new URL(check.path, baseUrl), { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "luna-deployment-smoke/1" } });
  if (response.status !== check.expected) { console.error(`${check.path} returned ${response.status}`); process.exit(1); }
  console.log(`${check.path} ok`);
}
