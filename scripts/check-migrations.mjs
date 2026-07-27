import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
const files = readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort();
const problems = []; const prefixes = new Set(); const migrations = [];
for (const file of files) {
  const match = /^(\d{8})(\d{4})_[a-z0-9_]+\.sql$/.exec(file);
  if (!match) { problems.push(`${file}:invalid_name`); continue; }
  const prefix = `${match[1]}${match[2]}`;
  if (prefixes.has(prefix)) problems.push(`${file}:duplicate_prefix`); prefixes.add(prefix);
  const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
  if (/\b(drop\s+(table|column|type)|truncate\s+table)\b/i.test(sql)) problems.push(`${file}:destructive_ddl`);
  const risks = [];
  if (/\balter\s+table\b/i.test(sql)) risks.push("table_lock");
  if (/\bcreate\s+(unique\s+)?index\b(?!\s+concurrently)/i.test(sql)) risks.push("index_build_lock");
  if (/\bvalidate\s+constraint\b/i.test(sql)) risks.push("constraint_scan");
  migrations.push({ file, sha256: createHash("sha256").update(sql).digest("hex"), risks: [...new Set(risks)] });
}
if (files.join("|") !== [...files].sort().join("|")) problems.push("migration_order");
const receipt = { schemaVersion: 1, generatedAt: new Date().toISOString(), migrationCount: migrations.length, migrations, destructiveFindings: problems };
if (output) writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
if (problems.length) { console.error(`Migration preflight failed: ${problems.join(", ")}`); process.exit(1); }
console.log(`Migration preflight passed: ${migrations.length} ordered migrations; ${migrations.filter((item) => item.risks.length).length} require rollout review.`);
