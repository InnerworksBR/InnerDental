import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202607270018_human_takeover_pause.sql", "utf8").toLowerCase();

describe("human takeover pause migration", () => {
  it("distinguishes bot echoes from human fromMe messages atomically", () => {
    expect(sql).toContain("create table public.whatsapp_bot_outbound_markers");
    expect(sql).toContain("create function public.register_whatsapp_from_me_activity");
    expect(sql).toContain("message_fingerprint = p_message_fingerprint");
    expect(sql).toContain("return 'bot'");
    expect(sql).toContain("return 'paused'");
  });

  it("pauses only the affected phone and ignores inbound messages during the pause", () => {
    expect(sql).toContain("create table public.whatsapp_conversation_pauses");
    expect(sql).toContain("p_pause_minutes integer default 20");
    expect(sql).toContain("where phone = p_phone and paused_until > now()");
    expect(sql).toContain("case when paused then 'ignored' else null end");
  });

  it("deduplicates Evolution retries and restricts operations to the service role", () => {
    expect(sql).toContain("create table public.whatsapp_from_me_events");
    expect(sql).toContain("on conflict (external_id) do nothing");
    expect(sql).toContain("grant execute on function public.register_whatsapp_from_me_activity");
    expect(sql).toContain("grant execute on function public.ingest_whatsapp_message");
  });
});
