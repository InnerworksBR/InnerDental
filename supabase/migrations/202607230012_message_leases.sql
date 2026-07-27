-- Leases verificáveis e dead-letter aditivos para inbox/outbox.
-- Aplicar antes do worker novo. Não remove colunas, estados ou funções antigas.

alter table public.notification_outbox
  add column lease_token uuid,
  add column lease_owner text,
  add column lease_expires_at timestamptz,
  add column dead_lettered_at timestamptz;

alter table public.whatsapp_inbox
  add column lease_token uuid,
  add column lease_owner text,
  add column lease_expires_at timestamptz,
  add column dead_lettered_at timestamptz;

alter table public.notification_outbox
  add constraint notification_outbox_lease_complete_check check (
    (lease_token is null and lease_owner is null and lease_expires_at is null)
    or (lease_token is not null and lease_owner is not null and lease_expires_at is not null)
  ) not valid;

alter table public.whatsapp_inbox
  add constraint whatsapp_inbox_lease_complete_check check (
    (lease_token is null and lease_owner is null and lease_expires_at is null)
    or (lease_token is not null and lease_owner is not null and lease_expires_at is not null)
  ) not valid;

create index notification_outbox_claimable_v2_idx
  on public.notification_outbox (available_at, created_at)
  where status in ('pending', 'failed') and dead_lettered_at is null;
create index whatsapp_inbox_claimable_v2_idx
  on public.whatsapp_inbox (available_at, created_at)
  where status in ('pending', 'failed') and dead_lettered_at is null;
create index notification_outbox_dead_letter_idx
  on public.notification_outbox (dead_lettered_at desc)
  where dead_lettered_at is not null;
create index whatsapp_inbox_dead_letter_idx
  on public.whatsapp_inbox (dead_lettered_at desc)
  where dead_lettered_at is not null;

create function public.claim_notification_outbox_leased(batch_size integer, worker_id text, lease_seconds integer default 300)
returns setof public.notification_outbox
language plpgsql
security invoker
set search_path = public
as $$
begin
  if char_length(trim(worker_id)) < 8 or char_length(worker_id) > 120 then raise exception 'INVALID_WORKER_ID'; end if;
  update public.notification_outbox
    set dead_lettered_at = now(), last_error = 'max_attempts_exceeded', lease_token = null, lease_owner = null, lease_expires_at = null
    where dead_lettered_at is null and attempts >= 6 and (
      status in ('pending', 'failed')
      or (status = 'processing' and coalesce(lease_expires_at, updated_at + interval '5 minutes') < now())
    );
  return query
  with candidates as (
    select id from public.notification_outbox
    where dead_lettered_at is null and attempts < 6 and (
      (status in ('pending', 'failed') and available_at <= now())
      or (status = 'processing' and coalesce(lease_expires_at, updated_at + interval '5 minutes') < now())
    )
    order by available_at, created_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.notification_outbox item
    set status = 'processing', attempts = attempts + 1, lease_token = gen_random_uuid(), lease_owner = worker_id,
        lease_expires_at = now() + make_interval(secs => greatest(30, least(lease_seconds, 900)))
    from candidates where item.id = candidates.id
    returning item.*;
end;
$$;

create function public.claim_whatsapp_inbox_leased(batch_size integer, worker_id text, lease_seconds integer default 300)
returns setof public.whatsapp_inbox
language plpgsql
security invoker
set search_path = public
as $$
begin
  if char_length(trim(worker_id)) < 8 or char_length(worker_id) > 120 then raise exception 'INVALID_WORKER_ID'; end if;
  update public.whatsapp_inbox
    set dead_lettered_at = now(), last_error = 'max_attempts_exceeded', lease_token = null, lease_owner = null, lease_expires_at = null
    where dead_lettered_at is null and attempts >= 6 and (
      status in ('pending', 'failed')
      or (status = 'processing' and coalesce(lease_expires_at, updated_at + interval '5 minutes') < now())
    );
  return query
  with candidates as (
    select id from public.whatsapp_inbox
    where dead_lettered_at is null and attempts < 6 and (
      (status in ('pending', 'failed') and available_at <= now())
      or (status = 'processing' and coalesce(lease_expires_at, updated_at + interval '5 minutes') < now())
    )
    order by available_at, created_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.whatsapp_inbox item
    set status = 'processing', attempts = attempts + 1, lease_token = gen_random_uuid(), lease_owner = worker_id,
        lease_expires_at = now() + make_interval(secs => greatest(30, least(lease_seconds, 900)))
    from candidates where item.id = candidates.id
    returning item.*;
end;
$$;

create function public.finish_notification_outbox_leased(
  message_id uuid, claimed_token uuid, final_status public.notification_status,
  error_code text default null, retry_at timestamptz default null, dead_letter boolean default false
)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if final_status not in ('sent', 'failed') then raise exception 'INVALID_FINAL_STATUS'; end if;
  update public.notification_outbox set
    status = final_status, last_error = error_code,
    available_at = coalesce(retry_at, available_at),
    sent_at = case when final_status = 'sent' then now() else sent_at end,
    dead_lettered_at = case when dead_letter then now() else dead_lettered_at end,
    lease_token = null, lease_owner = null, lease_expires_at = null
  where id = message_id and lease_token = claimed_token and lease_expires_at >= now() and dead_lettered_at is null;
  return found;
end;
$$;

create function public.finish_whatsapp_inbox_leased(
  message_id uuid, claimed_token uuid, final_status text,
  error_code text default null, retry_at timestamptz default null,
  intent text default null, action text default null, dead_letter boolean default false
)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if final_status not in ('processed', 'failed') then raise exception 'INVALID_FINAL_STATUS'; end if;
  update public.whatsapp_inbox set
    status = final_status, last_error = error_code,
    available_at = coalesce(retry_at, available_at),
    processed_at = case when final_status = 'processed' then now() else processed_at end,
    classified_intent = coalesce(intent, classified_intent), processed_action = coalesce(action, processed_action),
    dead_lettered_at = case when dead_letter then now() else dead_lettered_at end,
    lease_token = null, lease_owner = null, lease_expires_at = null
  where id = message_id and lease_token = claimed_token and lease_expires_at >= now() and dead_lettered_at is null;
  return found;
end;
$$;

create function public.message_queue_health()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'outbox_backlog', (select count(*) from public.notification_outbox where status in ('pending','failed') and dead_lettered_at is null),
    'inbox_backlog', (select count(*) from public.whatsapp_inbox where status in ('pending','failed') and dead_lettered_at is null),
    'outbox_dead_letters', (select count(*) from public.notification_outbox where dead_lettered_at is not null),
    'inbox_dead_letters', (select count(*) from public.whatsapp_inbox where dead_lettered_at is not null),
    'oldest_pending_seconds', greatest(
      coalesce(extract(epoch from now() - (select min(created_at) from public.notification_outbox where status in ('pending','failed') and dead_lettered_at is null)), 0),
      coalesce(extract(epoch from now() - (select min(created_at) from public.whatsapp_inbox where status in ('pending','failed') and dead_lettered_at is null)), 0)
    )
  );
$$;

revoke all on function public.claim_notification_outbox_leased(integer, text, integer) from public;
revoke all on function public.claim_whatsapp_inbox_leased(integer, text, integer) from public;
revoke all on function public.finish_notification_outbox_leased(uuid, uuid, public.notification_status, text, timestamptz, boolean) from public;
revoke all on function public.finish_whatsapp_inbox_leased(uuid, uuid, text, text, timestamptz, text, text, boolean) from public;
revoke all on function public.message_queue_health() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_notification_outbox_leased(integer, text, integer) to service_role;
    grant execute on function public.claim_whatsapp_inbox_leased(integer, text, integer) to service_role;
    grant execute on function public.finish_notification_outbox_leased(uuid, uuid, public.notification_status, text, timestamptz, boolean) to service_role;
    grant execute on function public.finish_whatsapp_inbox_leased(uuid, uuid, text, text, timestamptz, text, text, boolean) to service_role;
    grant execute on function public.message_queue_health() to service_role;
  end if;
end $$;
