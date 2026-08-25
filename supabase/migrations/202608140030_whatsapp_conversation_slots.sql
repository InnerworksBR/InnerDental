-- Persistent conversation slots for the LLM-driven WhatsApp triage.
-- Purely additive foundation: new table + 3 RPCs + a trigger that clears
-- slots whenever a human takes over the conversation. No existing table,
-- column, index, policy or function is dropped, renamed or rewritten.

begin;

create table public.whatsapp_conversation_slots (
  phone text primary key check (phone ~ '^[0-9]{12,15}$'),
  slots jsonb not null default '{}'::jsonb,
  prompt_inbox_id uuid,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index whatsapp_conversation_slots_expires_at_idx
  on public.whatsapp_conversation_slots (expires_at);

create trigger whatsapp_conversation_slots_set_updated_at
before update on public.whatsapp_conversation_slots
for each row execute function public.set_updated_at();

alter table public.whatsapp_conversation_slots enable row level security;
alter table public.whatsapp_conversation_slots force row level security;

-- Insert-or-upsert. Merges keys (new values override existing ones, but
-- unrelated keys are preserved) and bumps expires_at monotonically so a
-- downstream reader can rely on a single 24h sliding window.
create function public.apply_whatsapp_conversation_slots(
  p_phone text,
  p_slots jsonb,
  p_prompt_inbox_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  merged jsonb;
  next_expiry timestamptz;
begin
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;
  if jsonb_typeof(p_slots) is distinct from 'object' then raise exception 'INVALID_SLOTS'; end if;
  if p_prompt_inbox_id is not null then
    perform 1 from public.whatsapp_inbox where id = p_prompt_inbox_id for key share;
    if not found then raise exception 'INVALID_PROMPT_INBOX'; end if;
  end if;

  next_expiry := now() + interval '24 hours';

  insert into public.whatsapp_conversation_slots (phone, slots, prompt_inbox_id, expires_at)
  values (p_phone, coalesce(p_slots, '{}'::jsonb), p_prompt_inbox_id, next_expiry)
  on conflict (phone) do update
  set slots = public.whatsapp_conversation_slots.slots || excluded.slots,
      prompt_inbox_id = excluded.prompt_inbox_id,
      expires_at = greatest(public.whatsapp_conversation_slots.expires_at, excluded.expires_at),
      updated_at = now()
  returning slots into merged;

  return merged;
end;
$$;

-- Reads the persisted slots for a phone. Returns an empty object when the
-- row has expired so callers can treat the response as `ConversationSlots`
-- without a separate freshness check.
create function public.read_whatsapp_conversation_slots(p_phone text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (
      select slots
      from public.whatsapp_conversation_slots
      where phone = p_phone and expires_at > now()
    ),
    '{}'::jsonb
  );
$$;

-- Hard delete. Returns true when a row was actually removed.
create function public.clear_whatsapp_conversation_slots(p_phone text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;
  delete from public.whatsapp_conversation_slots where phone = p_phone;
  return found;
end;
$$;

-- Whenever the conversation pause table receives a new row, drop the slots
-- for that phone. The pause itself already blocks the inbound pipeline, so
-- keeping stale slots around would just confuse the post-handoff resume.
create function public.whatsapp_conversation_pauses_clear_slots()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.whatsapp_conversation_slots where phone = NEW.phone;
  return NEW;
end;
$$;

create trigger whatsapp_conversation_pauses_clear_slots_trg
after insert on public.whatsapp_conversation_pauses
for each row execute function public.whatsapp_conversation_pauses_clear_slots();

revoke all on function public.apply_whatsapp_conversation_slots(text, jsonb, uuid) from public;
revoke all on function public.read_whatsapp_conversation_slots(text) from public;
revoke all on function public.clear_whatsapp_conversation_slots(text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.apply_whatsapp_conversation_slots(text, jsonb, uuid) to service_role;
    grant execute on function public.read_whatsapp_conversation_slots(text) to service_role;
    grant execute on function public.clear_whatsapp_conversation_slots(text) to service_role;
  end if;
end $$;

commit;
