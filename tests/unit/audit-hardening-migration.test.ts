import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../../supabase/migrations/202607200011_audit_hardening.sql", import.meta.url);

describe("audit hardening migration", () => {
  it("aligns worker classifications and suppresses generic appointment updates", async () => {
    const migration = await readFile(migrationPath, "utf8");
    for (const value of ["insurance", "procedure", "faq", "greeting", "human", "llm_answer"]) expect(migration).toContain(`'${value}'`);
    expect(migration).toContain("if notification_event is null then return new");
  });

  it("requires atomic holds and prevents active duplicate slots", async () => {
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).toContain("create or replace function public.consume_slot_hold");
    expect(migration).toContain("appointments_one_active_slot");
    expect(migration).toContain("ACTIVE_APPOINTMENT_SLOT_DUPLICATES");
  });

  it("verifies OTP by phone with an attempt limit and removes historical uniqueness", async () => {
    const migration = await readFile(migrationPath, "utf8");
    expect(migration).toContain("create or replace function public.verify_otp_challenge");
    expect(migration).toContain("verification_attempts");
    expect(migration).toContain("drop constraint if exists access_tokens_token_hash_key");
  });
});
