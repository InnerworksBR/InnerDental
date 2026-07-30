import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../supabase/migrations/202607300023_professional_whatsapp_conversations.sql", import.meta.url), "utf8");

describe("professional WhatsApp conversations migration", () => {
  it("adds contextual intents and deterministic appointment lookup", () => {
    expect(sql).toContain("'appointment_status', 'treatment_status'");
    expect(sql).toContain("create or replace function public.get_upcoming_appointment_by_phone");
    expect(sql).toContain("'appointment_lookup', 'appointment_not_found'");
  });

  it("cancels pending automation and extends human takeover", () => {
    expect(sql).toContain("p_pause_minutes integer default 120");
    expect(sql).toMatch(/update public\.whatsapp_inbox[\s\S]*last_error = 'agent_paused'/);
    expect(sql).toContain("create or replace function public.is_whatsapp_conversation_paused");
  });

  it("repairs expired leases and common plan spellings", () => {
    expect(sql).toMatch(/set status = 'failed', dead_lettered_at = now\(\), last_error = 'max_attempts_exceeded'/);
    expect(sql).toContain("select id, 'Dental Par', true");
    expect(sql).toContain("select id, 'Tramontano', true");
  });

  it("contains no reference to a removed professional", () => {
    expect(sql).not.toMatch(/tarc[ií]lia/i);
  });
});
