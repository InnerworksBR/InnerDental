import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../supabase/migrations/202607280020_whatsapp_message_debounce.sql", import.meta.url), "utf8");

describe("WhatsApp message debounce migration", () => {
  it("delays a new inbound message until five seconds of silence", () => {
    expect(sql).toContain("now() + interval '5 seconds'");
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended(p_phone, 0))");
  });

  it("combines pending messages in order and consumes the older rows", () => {
    expect(sql).toContain("string_agg(buffered.message_text, E'\\n' order by buffered.created_at)");
    expect(sql).toContain("right(buffered_text || E'\\n' || p_message_text, 4000)");
    expect(sql).toContain("processed_action = 'merged'");
    expect(sql).toContain("merged_into_id = inserted_id");
  });

  it("keeps human-paused conversations immediate and ignored", () => {
    expect(sql).toContain("if paused then");
    expect(sql).toContain("'processed', 'agent_paused', now(), 'ignored'");
  });
});
