import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporary: string[] = [];
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("delivery automation", () => {
  it("creates an ordered, non-destructive migration receipt", () => {
    const directory = mkdtempSync(join(tmpdir(), "luna-migrations-")); temporary.push(directory); const output = join(directory, "receipt.json");
    execFileSync(process.execPath, ["scripts/check-migrations.mjs", "--output", output], { cwd: process.cwd() });
    const receipt = JSON.parse(readFileSync(output, "utf8"));
    expect(receipt.migrationCount).toBeGreaterThanOrEqual(12); expect(receipt.destructiveFindings).toEqual([]);
    expect(receipt.migrations.at(-1).file).toBe("202608280001_whatsapp_qualification_state.sql");
  });
  it("creates a sanitized release manifest from immutable receipts", () => {
    const directory = mkdtempSync(join(tmpdir(), "luna-release-")); temporary.push(directory);
    const migration = join(directory, "migrations.json"); const tests = join(directory, "tests.json"); const output = join(directory, "release.json");
    execFileSync(process.execPath, ["scripts/check-migrations.mjs", "--output", migration], { cwd: process.cwd() }); writeFileSync(tests, '{"status":"passed"}\n');
    execFileSync(process.execPath, ["scripts/create-release-manifest.mjs"], { cwd: process.cwd(), env: { ...process.env, RELEASE_REVISION: "abcdef0123456789", WEB_DIGEST: `sha256:${"a".repeat(64)}`, WORKER_DIGEST: `sha256:${"b".repeat(64)}`, TEST_RECEIPT: tests, MIGRATION_RECEIPT: migration, RELEASE_MANIFEST: output } });
    const manifest = JSON.parse(readFileSync(output, "utf8")); expect(manifest.images.web).toMatch(/^sha256:/); expect(manifest.evidence.migrationCount).toBeGreaterThanOrEqual(12);
    expect(JSON.stringify(manifest)).not.toMatch(/secret|password|database_url/i);
  });
  it("keeps backup and restore scripts fail-closed", () => {
    const backup = readFileSync("scripts/backup-postgres.sh", "utf8"); const restore = readFileSync("scripts/verify-restore.sh", "utf8");
    expect(backup).toContain("BACKUP_AGE_RECIPIENT"); expect(backup).toContain("mktemp -d"); expect(backup).toContain("rm -f \"$plain\"");
    expect(restore).toContain("RESTORE_CONFIRM_ISOLATED"); expect(restore).toContain("*restore_test*"); expect(restore).toContain("sha256sum --check");
  });
  it("rehearses the encrypted backup and isolated restore flow end to end", () => {
    const directory = mkdtempSync(join(tmpdir(), "luna-restore-rehearsal-")); temporary.push(directory);
    const bin = join(directory, "bin"); const backups = join(directory, "backups"); mkdirSync(bin); mkdirSync(backups);
    const tool = (name: string, source: string) => { const file = join(bin, name); writeFileSync(file, `#!/usr/bin/env sh\nset -eu\n${source}\n`); chmodSync(file, 0o755); };
    tool("pg_dump", 'for value in "$@"; do case "$value" in --file=*) printf "synthetic-custom-dump\\n" > "${value#--file=}";; esac; done');
    tool("pg_restore", 'last=""; for value in "$@"; do last="$value"; done; case " $* " in *" --list "*) [ -f "$last" ];; esac');
    tool("age", 'output=""; input=""; while [ "$#" -gt 0 ]; do case "$1" in --output) output="$2"; shift 2;; --recipient|--identity) shift 2;; --decrypt) shift;; *) input="$1"; shift;; esac; done; cp "$input" "$output"');
    tool("psql", 'case " $* " in *relrowsecurity*) printf "2\\n";; *) printf "5\\n";; esac');
    const toPosix = (value: string) => value.replace(/^([A-Za-z]):/, (_, drive: string) => `/mnt/${drive.toLowerCase()}`).replace(/\\/g, "/");
    const binPosix = toPosix(bin); const backupsPosix = toPosix(backups); const identity = join(directory, "identity.txt"); writeFileSync(identity, "synthetic identity\n");
    execFileSync("bash", ["-lc", `PATH='${binPosix}':"$PATH" DATABASE_URL='postgres://backup.invalid/db' BACKUP_AGE_RECIPIENT='age1synthetic' BACKUP_DESTINATION_DIR='${backupsPosix}' sh scripts/backup-postgres.sh rehearsal`], { cwd: process.cwd() });
    const encrypted = toPosix(join(backups, "rehearsal.dump.age")); const checksum = toPosix(join(backups, "rehearsal.sha256")); const report = join(directory, "restore-report.json");
    execFileSync("bash", ["-lc", `PATH='${binPosix}':"$PATH" RESTORE_TEST_DATABASE_URL='postgres://restore.invalid/restore_test' RESTORE_CONFIRM_ISOLATED='YES' BACKUP_AGE_IDENTITY_FILE='${toPosix(identity)}' RESTORE_REPORT='${toPosix(report)}' sh scripts/verify-restore.sh '${encrypted}' '${checksum}'`], { cwd: process.cwd() });
    const result = JSON.parse(readFileSync(report, "utf8")); expect(result).toMatchObject({ status: "passed", publicTableCount: 5, rlsTableCount: 2 });
    expect(readFileSync(join(backups, "rehearsal.manifest.json"), "utf8")).not.toMatch(/postgres:\/\//);
  }, 20_000);
});
