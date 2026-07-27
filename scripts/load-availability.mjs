const endpoint = process.env.LOAD_TEST_URL;
if (!endpoint) throw new Error("Set LOAD_TEST_URL to an authorized homologation availability URL.");
const requests = Number(process.env.LOAD_TEST_REQUESTS ?? 50);
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY ?? 5);
const cookie = process.env.LOAD_TEST_COOKIE;
const times = [];
let failures = 0;
for (let offset = 0; offset < requests; offset += concurrency) {
  await Promise.all(Array.from({ length: Math.min(concurrency, requests - offset) }, async () => {
    const started = performance.now();
    const response = await fetch(endpoint, { headers: cookie ? { cookie } : {} });
    times.push(performance.now() - started);
    if (!response.ok) failures += 1;
  }));
}
times.sort((a, b) => a - b);
const p95 = times[Math.max(0, Math.ceil(times.length * 0.95) - 1)];
console.log(JSON.stringify({ requests, concurrency, failures, p95Ms: Math.round(p95) }));
if (failures || p95 > 3000) process.exit(1);
