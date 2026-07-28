-- Pausa o agente por conversa quando uma pessoa responde pelo WhatsApp conectado.

create table public.whatsapp_conversation_pauses (
  phone text primary key check (phone ~ '^[0-9]{12,15}$'),
  paused_until timestamptz not null,
  source_external_id text not null,
  updated_at timestamptz not null default now()
);

create table public.whatsapp_bot_outbound_markers (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^[0-9]{12,15}$'),
  message_fingerprint text not null check (message_fingerprint ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index whatsapp_bot_outbound_markers_match_idx
  on public.whatsapp_bot_outbound_markers (phone, message_fingerprint, created_at desc)
  where consumed_at is null;

create table public.whatsapp_from_me_events (
  external_id text primary key,
  phone text not null check (phone ~ '^[0-9]{12,15}$'),
  disposition text not null check (disposition in ('pending', 'bot', 'human')),
  created_at timestamptz not null default now()
);

alter table public.whatsapp_conversation_pauses enable row level security;
alter table public.whatsapp_conversation_pauses force row level security;
alter table public.whatsapp_bot_outbound_markers enable row level security;
alter table public.whatsapp_bot_outbound_markers force row level security;
alter table public.whatsapp_from_me_events enable row level security;
alter table public.whatsapp_from_me_events force row level security;

create function public.register_whatsapp_from_me_activity(
  p_external_id text,
  p_phone text,
  p_message_fingerprint text,
  p_pause_minutes integer default 20
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_event text;
  marker_id uuid;
begin
  if char_length(trim(p_external_id)) < 1 or char_length(p_external_id) > 255 then raise exception 'INVALID_EXTERNAL_ID'; end if;
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;
  if p_message_fingerprint is not null and p_message_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_FINGERPRINT'; end if;
  if p_pause_minutes < 1 or p_pause_minutes > 120 then raise exception 'INVALID_PAUSE'; end if;

  insert into public.whatsapp_from_me_events (external_id, phone, disposition)
  values (p_external_id, p_phone, 'pending')
  on conflict (external_id) do nothing
  returning external_id into inserted_event;
  if inserted_event is null then return 'duplicate'; end if;

  select id into marker_id
  from public.whatsapp_bot_outbound_markers
  where phone = p_phone and consumed_at is null and expires_at > now()
    and (message_fingerprint = p_message_fingerprint or (p_message_fingerprint is null and created_at > now() - interval '10 seconds'))
  order by created_at
  for update skip locked
  limit 1;

  if marker_id is not null then
    update public.whatsapp_bot_outbound_markers set consumed_at = now() where id = marker_id;
    update public.whatsapp_from_me_events set disposition = 'bot' where external_id = p_external_id;
    return 'bot';
  end if;

  insert into public.whatsapp_conversation_pauses (phone, paused_until, source_external_id, updated_at)
  values (p_phone, now() + make_interval(mins => p_pause_minutes), p_external_id, now())
  on conflict (phone) do update set
    paused_until = greatest(public.whatsapp_conversation_pauses.paused_until, excluded.paused_until),
    source_external_id = excluded.source_external_id,
    updated_at = now();
  update public.whatsapp_from_me_events set disposition = 'human' where external_id = p_external_id;
  return 'paused';
end;
$$;

create function public.ingest_whatsapp_message(p_external_id text, p_phone text, p_message_text text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  paused boolean;
  inserted_id uuid;
begin
  if char_length(trim(p_external_id)) < 1 or char_length(p_external_id) > 255 then raise exception 'INVALID_EXTERNAL_ID'; end if;
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;
  if char_length(p_message_text) < 1 or char_length(p_message_text) > 4000 then raise exception 'INVALID_MESSAGE'; end if;
  select exists (
    select 1 from public.whatsapp_conversation_pauses
    where phone = p_phone and paused_until > now()
  ) into paused;

  insert into public.whatsapp_inbox (external_id, phone, message_text, status, last_error, processed_at, processed_action)
  values (p_external_id, p_phone, p_message_text,
    case when paused then 'processed' else 'pending' end,
    case when paused then 'agent_paused' else null end,
    case when paused then now() else null end,
    case when paused then 'ignored' else null end)
  on conflict (external_id) do nothing
  returning id into inserted_id;
  if inserted_id is null then return 'duplicate'; end if;
  return case when paused then 'ignored' else 'queued' end;
end;
$$;

revoke all on function public.register_whatsapp_from_me_activity(text, text, text, integer) from public;
revoke all on function public.ingest_whatsapp_message(text, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.register_whatsapp_from_me_activity(text, text, text, integer) to service_role;
    grant execute on function public.ingest_whatsapp_message(text, text, text) to service_role;
  end if;
end;
$$;
