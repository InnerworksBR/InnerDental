import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202607230012_message_leases.sql", "utf8");

describe("message lease migration", () => {
  it("adds leases and dead-letter without destructive DDL", () => {
    expect(sql).toContain("lease_token uuid");
    expect(sql).toContain("dead_lettered_at timestamptz");
    expect(sql).not.toMatch(/drop\s+(table|column|type)/i);
  });
  it("guards completion with token and expiry", () => {
    expect(sql).toMatch(/lease_token = claimed_token/i);
    expect(sql).toMatch(/lease_expires_at >= now\(\)/i);
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("coalesce(lease_expires_at, updated_at + interval '5 minutes')");
  });
  it("defers constraint validation to an approved low-traffic window", () => expect(sql).not.toMatch(/validate constraint/i));
  it("keeps service-role-only execution", () => {
    expect(sql).toContain("revoke all on function public.claim_notification_outbox_leased");
    expect(sql).toContain("grant execute on function public.message_queue_health() to service_role");
  });
});
