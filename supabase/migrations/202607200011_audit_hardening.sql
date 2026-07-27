-- Hardening aditivo pós-auditoria.
-- Aplicar antes do novo web/worker. A migration aborta se já houver slots duplicados.

alter table public.whatsapp_inbox
  drop constraint if exists whatsapp_inbox_classified_intent_check,
  drop constraint if exists whatsapp_inbox_processed_action_check;

alter table public.whatsapp_inbox
  add constraint whatsapp_inbox_classified_intent_check
    check (classified_intent in ('schedule', 'reschedule', 'cancel', 'insurance', 'procedure', 'faq', 'greeting', 'human')),
  add constraint whatsapp_inbox_processed_action_check
    check (processed_action in ('portal_link', 'structured_answer', 'llm_answer', 'handoff', 'ignored'));

create or replace function public.enqueue_appointment_notification()
returns trigger
language plpgsql
set search_path = public
as $$
declare notification_event text;
begin
  notification_event := case
    when tg_op = 'INSERT' then 'appointment.created'
    when old.status is distinct from new.status and new.status = 'cancelled' then 'appointment.cancelled'
    when old.start_at is distinct from new.start_at then 'appointment.rescheduled'
    else null
  end;

  if notification_event is null then return new; end if;

  insert into public.notification_outbox (aggregate_type, aggregate_id, event_type, payload)
  values ('appointment', new.id, notification_event, jsonb_build_object('appointment_id', new.id));
  return new;
end;
$$;

alter table public.patients
  add column if not exists insurance_plan_id uuid references public.insurance_plans(id) on delete set null;

alter table public.access_tokens
  add column if not exists verification_attempts smallint not null default 0 check (verification_attempts between 0 and 10);

alter table public.access_tokens drop constraint if exists access_tokens_token_hash_key;
create index if not exists access_tokens_phone_hash_active_idx
  on public.access_tokens (phone, token_hash, created_at desc)
  where status = 'active';

create or replace function public.issue_otp_challenge(p_phone text, p_token_hash text, p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare challenge_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_phone));
  if (select count(*) from public.access_tokens where phone = p_phone and origin = 'direct_otp' and created_at > now() - interval '15 minutes') >= 5 then
    return null;
  end if;

  update public.access_tokens
     set status = 'revoked'
   where phone = p_phone and origin = 'direct_otp' and status = 'active';

  insert into public.access_tokens (phone, token_hash, origin, session_id, expires_at)
  values (p_phone, p_token_hash, 'direct_otp', p_session_id, now() + interval '5 minutes')
  returning id into challenge_id;

  insert into public.notification_outbox (aggregate_type, aggregate_id, event_type, payload)
  values ('access_token', challenge_id, 'auth.otp_requested', jsonb_build_object('access_token_id', challenge_id));
  return challenge_id;
end;
$$;

create or replace function public.verify_otp_challenge(p_phone text, p_token_hash text, p_max_attempts integer default 5)
returns table (phone text, session_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare challenge public.access_tokens%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_phone));

  select * into challenge
    from public.access_tokens
   where access_tokens.phone = p_phone
     and origin = 'direct_otp'
     and status = 'active'
     and expires_at > now()
   order by created_at desc
   limit 1
   for update;

  if not found then return; end if;

  if challenge.verification_attempts >= greatest(1, least(p_max_attempts, 10)) then
    update public.access_tokens set status = 'revoked' where id = challenge.id;
    return;
  end if;

  if challenge.token_hash <> p_token_hash then
    update public.access_tokens
       set verification_attempts = verification_attempts + 1,
           status = case when verification_attempts + 1 >= greatest(1, least(p_max_attempts, 10)) then 'revoked'::public.access_token_status else status end
     where id = challenge.id;
    return;
  end if;

  update public.access_tokens
     set status = 'used', used_at = now()
   where id = challenge.id;
  return query select challenge.phone, challenge.session_id;
end;
$$;

do $$
begin
  if exists (
    select 1 from public.appointments
     where status in ('scheduled', 'rescheduled')
     group by professional_id, start_at having count(*) > 1
  ) then
    raise exception 'ACTIVE_APPOINTMENT_SLOT_DUPLICATES';
  end if;
end;
$$;

create unique index if not exists appointments_one_active_slot
  on public.appointments (professional_id, start_at)
  where status in ('scheduled', 'rescheduled');

create or replace function public.consume_slot_hold(
  p_hold_id uuid,
  p_professional_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_phone text,
  p_session_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with consumed as (
    update public.slot_holds
       set status = 'consumed'
     where id = p_hold_id
       and professional_id = p_professional_id
       and start_at = p_start_at
       and end_at = p_end_at
       and phone = p_phone
       and session_id = p_session_id
       and status = 'active'
       and expires_at > now()
    returning id
  )
  select exists(select 1 from consumed);
$$;

revoke all on function public.verify_otp_challenge(text, text, integer) from public;
revoke all on function public.consume_slot_hold(uuid, uuid, timestamptz, timestamptz, text, uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.verify_otp_challenge(text, text, integer) to service_role;
    grant execute on function public.consume_slot_hold(uuid, uuid, timestamptz, timestamptz, text, uuid) to service_role;
  end if;
end;
$$;
