#!/usr/bin/env sh
set -eu
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required}"
: "${BACKUP_DESTINATION_DIR:?BACKUP_DESTINATION_DIR is required}"
backup_id="${1:?usage: backup-postgres.sh BACKUP_ID}"
case "$backup_id" in *[!A-Za-z0-9._-]*|'') echo "Invalid backup id" >&2; exit 2;; esac
for command in pg_dump pg_restore age sha256sum; do command -v "$command" >/dev/null 2>&1 || { echo "Missing required command: $command" >&2; exit 3; }; done
[ -d "$BACKUP_DESTINATION_DIR" ] || { echo "Backup destination is not an existing directory" >&2; exit 4; }
umask 077
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM
plain="$work_dir/$backup_id.dump"
encrypted="$work_dir/$backup_id.dump.age"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$plain"
pg_restore --list "$plain" >/dev/null
age --recipient "$BACKUP_AGE_RECIPIENT" --output "$encrypted" "$plain"
rm -f "$plain"
(cd "$work_dir" && sha256sum "$backup_id.dump.age" > "$backup_id.sha256")
size_bytes="$(wc -c < "$encrypted" | tr -d ' ')"
printf '{"backupId":"%s","createdAt":"%s","format":"pg_dump-custom+age","sizeBytes":%s}\n' "$backup_id" "$started_at" "$size_bytes" > "$work_dir/$backup_id.manifest.json"
mv "$encrypted" "$work_dir/$backup_id.sha256" "$work_dir/$backup_id.manifest.json" "$BACKUP_DESTINATION_DIR/"
echo "Encrypted backup, checksum and manifest created for backup id: $backup_id"
