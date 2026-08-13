#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const localUrl = process.env.LOCAL_POSTGRES_URL;

if (!localUrl) throw new Error("LOCAL_POSTGRES_URL_REQUIRED");
const maintenanceUrl = new URL(localUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(maintenanceUrl.hostname)) {
  throw new Error("LOCAL_POSTGRES_URL_MUST_TARGET_LOCALHOST");
}
for (const executable of ["psql"]) {
  if (spawnSync(executable, ["--version"], { stdio: "ignore" }).status !== 0) {
    throw new Error(`${executable.toUpperCase()}_REQUIRED`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(`${command} failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function databaseUrl(databaseName) {
  const url = new URL(maintenanceUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function psql(url, args) {
  return run("psql", [url, "-v", "ON_ERROR_STOP=1", ...args]);
}

function sql(url, statement) {
  return psql(url, ["-c", statement]);
}

function localDatabase(prefix) {
  const name = `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
  sql(maintenanceUrl.toString(), `create database ${name}`);
  return { name, url: databaseUrl(name) };
}

function dropDatabase(name) {
  sql(maintenanceUrl.toString(), `drop database if exists ${name} with (force)`);
}

function applyMigrations(url, filter = () => true) {
  const files = readdirSync(path.join(root, "supabase/migrations"))
    .filter((file) => file.endsWith(".sql") && filter(file))
    .sort();
  for (const file of files) psql(url, ["-f", path.join("supabase/migrations", file)]);
}

function applyMigration(url, file) {
  psql(url, ["-f", path.join("supabase/migrations", file)]);
}

function migrationResult(url, file) {
  return spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", path.join("supabase/migrations", file)], {
    cwd: root,
    encoding: "utf8",
  });
}

function applySeed(url) {
  psql(url, ["-f", "supabase/seed.sql"]);
}

function runRegression(url) {
  psql(url, ["-f", "tests/database/whatsapp-routing-definitivo.sql"]);
}

async function testConcurrentPublicTermOwnership(url) {
  const term = `parallel-${randomUUID().slice(0, 8)}`;
  const first = spawn("psql", [url, "-v", "ON_ERROR_STOP=1", "-c", `begin; select public.save_insurance_plan_catalog(null, '${term}-one', null, true, array['${term}']); select pg_sleep(1); commit;`], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const second = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-c", `select public.save_insurance_plan_catalog(null, '${term}-two', null, true, array['${term}']);`], { cwd: root, encoding: "utf8" });
  const firstResult = await new Promise((resolve) => first.on("close", (code) => resolve(code)));
  if (firstResult !== 0 || second.status === 0 || !/duplicate key|unique/i.test(second.stderr)) {
    throw new Error("CONCURRENT_PUBLIC_TERM_OWNERSHIP_NOT_REJECTED");
  }
}

async function testAcceptanceVsRejection(url) {
  const phone = "5513990000018";
  const prompt = "00000000-0000-4000-8000-000000000180";
  const answer = "00000000-0000-4000-8000-000000000181";
  const plan = sql(url, "select id from public.insurance_plans where name = 'Particular' and active limit 1;").trim().split("\n").find((line) => /^[0-9a-f-]{36}$/i.test(line))?.trim();
  if (!plan) throw new Error("PARTICULAR_PLAN_NOT_READY");
  sql(url, `insert into public.whatsapp_inbox (id, external_id, phone, message_text) values ('${prompt}', 'interleaving-prompt', '${phone}', 'quero marcar'), ('${answer}', 'interleaving-answer', '${phone}', 'Particular'); select public.transition_whatsapp_plan_triage('${phone}', 'begin', 'quero marcar', '${prompt}');`);

  const accepter = spawn("psql", [url, "-v", "ON_ERROR_STOP=1", "-c", `begin; select pg_advisory_xact_lock(hashtextextended('${phone}', 0)); select pg_sleep(1); select public.accept_whatsapp_plan_triage('${phone}', '${plan}', '${prompt}', '${answer}'); commit;`], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const rejection = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-tAc", `select public.transition_whatsapp_plan_triage('${phone}', 'reject', 'quero marcar', '${prompt}');`], { cwd: root, encoding: "utf8" });
  const accepted = await new Promise((resolve) => accepter.on("close", (code) => resolve(code)));
  if (accepted !== 0 || rejection.status !== 0 || rejection.stdout.trim() !== "f") {
    throw new Error("ACCEPTANCE_REJECTION_INTERLEAVING_NOT_SERIALIZED");
  }
}

const created = [];
try {
  const fresh = localDatabase("luna_whatsapp_fresh");
  created.push(fresh.name);
  applyMigrations(fresh.url);
  applySeed(fresh.url);
  runRegression(fresh.url);
  await testConcurrentPublicTermOwnership(fresh.url);
  await testAcceptanceVsRejection(fresh.url);

  // An installation stopped at 023 is upgraded with a legacy canonical
  // Odontopreve row before the definitive migrations are applied.
  const upgrade = localDatabase("luna_whatsapp_upgrade");
  created.push(upgrade.name);
  applyMigrations(upgrade.url, (file) => file < "202608120024_whatsapp_routing_definitivo.sql");
  applySeed(upgrade.url);
  sql(upgrade.url, "insert into public.insurance_plans (name, active) values ('Odontopreve', true) on conflict (name) do update set active = true;");
  applyMigrations(upgrade.url, (file) => file >= "202608120024_whatsapp_routing_definitivo.sql");
  runRegression(upgrade.url);

  // A conflicting historical coverage fact must abort the actual upgrade
  // transaction. Nothing from 025's registry/reconciliation may persist.
  const conflictingUpgrade = localDatabase("luna_whatsapp_conflict");
  created.push(conflictingUpgrade.name);
  applyMigrations(conflictingUpgrade.url, (file) => file < "202608120024_whatsapp_routing_definitivo.sql");
  applySeed(conflictingUpgrade.url);
  sql(conflictingUpgrade.url, "insert into public.insurance_plans (name, active) values ('Odontopreve', true) on conflict (name) do update set active = true;");
  sql(conflictingUpgrade.url, "insert into public.procedures (name, description, online_booking, active) values ('Incident 018 upgrade conflict', 'fixture', false, true); insert into public.procedure_coverage (procedure_id, insurance_plan_id, accepted, instructions) select procedure.id, plan.id, plan.name = 'Rede UNNA', case when plan.name = 'Rede UNNA' then 'canonical fact' else 'conflicting legacy fact' end from public.procedures procedure cross join public.insurance_plans plan where procedure.name = 'Incident 018 upgrade conflict' and plan.name in ('Rede UNNA', 'Odontopreve');");
  applyMigration(conflictingUpgrade.url, "202608120024_whatsapp_routing_definitivo.sql");
  const conflict = migrationResult(conflictingUpgrade.url, "202608130025_whatsapp_catalog_concurrency_and_particular.sql");
  if (conflict.status === 0 || !/REDE_UNNA_COVERAGE_CONFLICT/.test(`${conflict.stderr}\n${conflict.stdout}`)) {
    throw new Error("CONFLICTING_UPGRADE_WAS_NOT_REJECTED");
  }
  const rollbackState = sql(conflictingUpgrade.url, "select case when exists (select 1 from public.insurance_plans where name = 'Odontopreve' and active) and exists (select 1 from public.procedure_coverage coverage join public.procedures procedure on procedure.id = coverage.procedure_id join public.insurance_plans plan on plan.id = coverage.insurance_plan_id where procedure.name = 'Incident 018 upgrade conflict' and plan.name = 'Odontopreve' and coverage.accepted = false and coverage.instructions = 'conflicting legacy fact') and to_regclass('public.insurance_aliases_active_normalized_term_uniq') is null then 'rolled_back' else 'partial_upgrade' end;").trim();
  if (!rollbackState.includes("rolled_back")) throw new Error("CONFLICTING_UPGRADE_DID_NOT_ROLL_BACK_FULLY");

  console.log("WhatsApp routing PostgreSQL regression passed.");
} finally {
  for (const name of created.reverse()) {
    try { dropDatabase(name); } catch (error) { console.error(`Could not drop ${name}:`, error); }
  }
}
