import { readFileSync } from "node:fs";

const prometheus = readFileSync("ops/observability/prometheus.yml", "utf8");
const alerts = readFileSync("ops/observability/alerts.yml", "utf8");
const dashboard = JSON.parse(readFileSync("ops/observability/dashboards/luna-operations.json", "utf8"));
const problems = [];
for (const fragment of ["credentials_file: /run/secrets/metrics_token", "web:3000", "worker:3001"]) if (!prometheus.includes(fragment)) problems.push(`prometheus:${fragment}`);
for (const alert of ["LunaWebUnavailable", "LunaWorkerUnavailable", "LunaHttpErrorsHigh", "LunaQueueOldestItem", "LunaQueueDeadLetters"]) if (!alerts.includes(`alert: ${alert}`)) problems.push(`alert:${alert}`);
if (!alerts.includes("docs/runbooks/incident-response.md")) problems.push("alerts:runbook");
if (!Array.isArray(dashboard.panels) || dashboard.panels.length < 6) problems.push("dashboard:panels");
const combined = `${prometheus}\n${alerts}\n${JSON.stringify(dashboard)}`;
if (/(551\d{9,}|authorization: bearer\s+\S+|api[_-]?key:\s*\S+)/i.test(combined)) problems.push("sensitive-data");
if (problems.length) { console.error(`Observability configuration invalid: ${problems.join(", ")}`); process.exit(1); }
console.log(`Observability configuration valid: ${dashboard.panels.length} dashboard panels.`);
