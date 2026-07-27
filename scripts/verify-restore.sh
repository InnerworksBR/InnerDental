#!/usr/bin/env sh
set -eu
: "${RESTORE_TEST_DATABASE_URL:?RESTORE_TEST_DATABASE_URL is required}"
: "${RESTORE_CONFIRM_ISOLATED:?RESTORE_CONFIRM_ISOLATED=YES is required}"
: "${BACKUP_AGE_IDENTITY_FILE:?BACKUP_AGE_IDENTITY_FILE is required}"
encrypted="${1:?usage: verify-restore.sh BACKUP.dump.age}"
checksum="${2:-${encrypted%.dump.age}.sha256}"
report="${RESTORE_REPORT:-restore-report.json}"
[ "$RESTORE_CONFIRM_ISOLATED" = "YES" ] || { echo "Refusing restore: explicit isolated confirmation is required" >&2; exit 2; }
case "$RESTORE_TEST_DATABASE_URL" in *restore_test*) ;; *) echo "Refusing restore: target URL must contain restore_test" >&2; exit 2;; esac
case "$RESTORE_TEST_DATABASE_URL" in *production*|*prod_db*|*supabase.co*) echo "Refusing restore: target resembles a shared/production database" >&2; exit 2;; esac
for command in pg_restore psql age sha256sum; do command -v "$command" >/dev/null 2>&1 || { echo "Missing required command: $command" >&2; exit 3; }; done
[ -f "$encrypted" ] && [ -f "$checksum" ] && [ -f "$BACKUP_AGE_IDENTITY_FILE" ] || { echo "Encrypted backup, checksum or identity file missing" >&2; exit 4; }
umask 077
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM
cp "$encrypted" "$checksum" "$work_dir/"
(cd "$work_dir" && sha256sum --check "$(basename "$checksum")") >/dev/null
plain="$work_dir/restore.dump"
age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" --output "$plain" "$encrypted"
pg_restore --list "$plain" >/dev/null
started="$(date +%s)"
pg_restore --dbname="$RESTORE_TEST_DATABASE_URL" --clean --if-exists --no-owner --no-acl "$plain"
table_count="$(psql "$RESTORE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "select count(*) from information_schema.tables where table_schema='public';")"
rls_count="$(psql "$RESTORE_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity;")"
duration="$(( $(date +%s) - started ))"
printf '{"status":"passed","durationSeconds":%s,"publicTableCount":%s,"rlsTableCount":%s,"verifiedAt":"%s"}\n' "$duration" "$table_count" "$rls_count" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$report"
echo "Isolated restore verified; sanitized report written."
