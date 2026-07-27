import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/202607170010_internal_operations.sql", import.meta.url);

describe("internal operations migration", () => {
  it("creates internal data with RLS deny-by-default and no permissive browser policies", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("create table public.internal_profiles");
    expect(migration).toContain("references auth.users(id)");
    expect(migration).toContain("create table public.operational_incidents");
    expect(migration).toContain("create table public.operational_incident_notes");
    expect(migration).toContain("create table public.calendar_blocks");
    expect(migration).toContain("calendar_blocks_active_professional_date_idx");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("force row level security");
    expect(migration).not.toContain("create policy");
  });

  it("requires an external Calendar event before an active full-day block", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("status = 'active' and calendar_event_id is not null");
    expect(migration).toContain("idempotency_key uuid not null unique");
    expect(migration).toContain("reconciliation_required");
  });
});
