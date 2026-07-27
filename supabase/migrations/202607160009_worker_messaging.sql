-- Infraestrutura aditiva para o worker de mensageria.

create table public.whatsapp_inbox (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  phone text not null check (phone ~ '^[0-9]{12,15}$'),
  message_text text not null check (char_length(message_text) between 1 and 4000),
  status text not null default 'pending' check (status in ('pending', 'processing', 'processed', 'failed')),
  attempts smallint not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.otp_delivery_secrets (
  access_token_id uuid primary key references public.access_tokens(id) on delete cascade,
  encrypted_code text not null check (char_length(encrypted_code) >= 32),
  created_at timestamptz not null default now()
);

create table public.human_handoffs (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null unique references public.whatsapp_inbox(id) on delete restrict,
  phone text not null check (phone ~ '^[0-9]{12,15}$'),
  reason text not null check (char_length(reason) between 1 and 120),
  status text not null default 'pending' check (status in ('pending', 'acknowledged', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.notification_outbox add column dedupe_key text unique;

create index whatsapp_inbox_pending_idx
  on public.whatsapp_inbox (available_at, created_at)
  where status in ('pending', 'failed');
create index whatsapp_inbox_processing_idx
  on public.whatsapp_inbox (updated_at)
  where status = 'processing';

create index notification_outbox_processing_idx
  on public.notification_outbox (updated_at)
  where status = 'processing';

create index appointments_reminder_idx
  on public.appointments (start_at)
  where status in ('scheduled', 'rescheduled');

create trigger whatsapp_inbox_set_updated_at
before update on public.whatsapp_inbox
for each row execute function public.set_updated_at();

alter table public.whatsapp_inbox enable row level security;
alter table public.whatsapp_inbox force row level security;
alter table public.otp_delivery_secrets enable row level security;
alter table public.otp_delivery_secrets force row level security;
alter table public.human_handoffs enable row level security;
alter table public.human_handoffs force row level security;

create function public.claim_whatsapp_inbox(batch_size integer)
returns setof public.whatsapp_inbox
language sql
set search_path = public
as $$
  with candidates as (
    select id from public.whatsapp_inbox
    where (status in ('pending', 'failed') and available_at <= now())
       or (status = 'processing' and updated_at < now() - interval '5 minutes')
    order by available_at, created_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.whatsapp_inbox inbox
  set status = 'processing', attempts = attempts + 1
  from candidates where inbox.id = candidates.id
  returning inbox.*;
$$;

create or replace function public.claim_notification_outbox(batch_size integer)
returns setof public.notification_outbox
language sql
set search_path = public
as $$
  with candidates as (
    select id from public.notification_outbox
    where (status in ('pending', 'failed') and available_at <= now())
       or (status = 'processing' and updated_at < now() - interval '5 minutes')
    order by available_at, created_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.notification_outbox outbox
  set status = 'processing', attempts = attempts + 1
  from candidates where outbox.id = candidates.id
  returning outbox.*;
$$;

create function public.enqueue_due_appointment_reminders(batch_size integer default 100)
returns integer
language plpgsql
set search_path = public
as $$
declare inserted_count integer;
begin
  insert into public.notification_outbox (aggregate_type, aggregate_id, event_type, payload, available_at, dedupe_key)
  select 'appointment', a.id, 'appointment.reminder', jsonb_build_object('appointment_id', a.id), now(), 'appointment.reminder:' || a.id::text
  from public.appointments a
  where a.status in ('scheduled', 'rescheduled')
    and a.start_at > now() + interval '23 hours 55 minutes'
    and a.start_at <= now() + interval '24 hours 5 minutes'
  order by a.start_at
  limit greatest(1, least(batch_size, 500))
  on conflict (dedupe_key) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create function public.purge_expired_otp_delivery_secrets()
returns integer
language plpgsql
set search_path = public
as $$
declare deleted_count integer;
begin
  delete from public.otp_delivery_secrets secret
  using public.access_tokens token
  where secret.access_token_id = token.id and token.expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.claim_whatsapp_inbox(integer) from public;
revoke all on function public.enqueue_due_appointment_reminders(integer) from public;
revoke all on function public.purge_expired_otp_delivery_secrets() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_whatsapp_inbox(integer) to service_role;
    grant execute on function public.enqueue_due_appointment_reminders(integer) to service_role;
    grant execute on function public.purge_expired_otp_delivery_secrets() to service_role;
  end if;
end $$;
