-- Torna o atendimento do WhatsApp contextual, preserva a intervenção humana e corrige filas expiradas.

alter table public.whatsapp_inbox
  drop constraint if exists whatsapp_inbox_classified_intent_check,
  drop constraint if exists whatsapp_inbox_processed_action_check;

alter table public.whatsapp_inbox
  add constraint whatsapp_inbox_classified_intent_check
    check (classified_intent in (
      'schedule', 'reschedule', 'cancel', 'confirm', 'appointment_status', 'treatment_status',
      'insurance', 'procedure', 'faq', 'greeting', 'human', 'conversation'
    )),
  add constraint whatsapp_inbox_processed_action_check
    check (processed_action in (
      'portal_link', 'structured_answer', 'llm_answer', 'fallback_answer', 'handoff', 'ignored', 'merged',
      'appointment_confirmed', 'appointment_already_confirmed', 'confirmation_not_found', 'confirmation_ambiguous',
      'appointment_lookup', 'appointment_not_found',
      'plan_requested', 'plan_rejected', 'plan_rejected_caixa'
    ));

create or replace function public.get_upcoming_appointment_by_phone(p_phone text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  upcoming record;
begin
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;

  select appointment.start_at, professional.name as professional_name
  into upcoming
  from public.appointments appointment
  join public.patients patient on patient.id = appointment.patient_id
  join public.professionals professional on professional.id = appointment.professional_id
  where patient.phone = p_phone
    and appointment.status in ('scheduled', 'rescheduled')
    and appointment.start_at > now()
  order by appointment.start_at
  limit 1;

  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object(
    'status', 'found',
    'start_at', upcoming.start_at,
    'professional_name', upcoming.professional_name
  );
end;
$$;

create or replace function public.is_whatsapp_conversation_paused(p_phone text)
returns boolean
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;
  return exists (
    select 1 from public.whatsapp_conversation_pauses
    where phone = p_phone and paused_until > now()
  );
end;
$$;

create or replace function public.register_whatsapp_from_me_activity(
  p_external_id text,
  p_phone text,
  p_message_fingerprint text,
  p_pause_minutes integer default 120
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
  if p_pause_minutes < 1 or p_pause_minutes > 1440 then raise exception 'INVALID_PAUSE'; end if;

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

  update public.whatsapp_inbox
  set status = 'processed', processed_at = now(), processed_action = 'ignored', last_error = 'agent_paused',
      lease_token = null, lease_owner = null, lease_expires_at = null
  where phone = p_phone
    and status in ('pending', 'failed')
    and dead_lettered_at is null
    and lease_token is null;

  update public.whatsapp_from_me_events set disposition = 'human' where external_id = p_external_id;
  return 'paused';
end;
$$;

create or replace function public.claim_notification_outbox_leased(batch_size integer, worker_id text, lease_seconds integer default 300)
returns setof public.notification_outbox
language plpgsql
security invoker
set search_path = public
as $$
begin
  if char_length(trim(worker_id)) < 8 or char_length(worker_id) > 120 then raise exception 'INVALID_WORKER_ID'; end if;
  update public.notification_outbox
    set status = 'failed', dead_lettered_at = now(), last_error = 'max_attempts_exceeded',
        lease_token = null, lease_owner = null, lease_expires_at = null
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

create or replace function public.claim_whatsapp_inbox_leased(batch_size integer, worker_id text, lease_seconds integer default 300)
returns setof public.whatsapp_inbox
language plpgsql
security invoker
set search_path = public
as $$
begin
  if char_length(trim(worker_id)) < 8 or char_length(worker_id) > 120 then raise exception 'INVALID_WORKER_ID'; end if;
  update public.whatsapp_inbox
    set status = 'failed', dead_lettered_at = now(), last_error = 'max_attempts_exceeded',
        lease_token = null, lease_owner = null, lease_expires_at = null
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

update public.notification_outbox set status = 'failed'
where dead_lettered_at is not null and status = 'processing';

update public.whatsapp_inbox set status = 'failed'
where dead_lettered_at is not null and status = 'processing';

update public.insurance_plans
set active = false, instructions = 'Plano não atendido pela clínica.'
where name ilike '%caixa%';

insert into public.insurance_aliases (insurance_plan_id, alias, active)
select id, 'Dental Par', true from public.insurance_plans where name = 'DentalPar'
on conflict (insurance_plan_id, alias) do update set active = true;

insert into public.insurance_aliases (insurance_plan_id, alias, active)
select id, 'Tramontano', true from public.insurance_plans where name = 'Transmontano'
on conflict (insurance_plan_id, alias) do update set active = true;

update public.whatsapp_plan_triage_sessions
set expires_at = now(), updated_at = now()
where status = 'rejected' and expires_at > now();

revoke all on function public.get_upcoming_appointment_by_phone(text) from public;
revoke all on function public.is_whatsapp_conversation_paused(text) from public;
revoke all on function public.register_whatsapp_from_me_activity(text, text, text, integer) from public;
revoke all on function public.claim_notification_outbox_leased(integer, text, integer) from public;
revoke all on function public.claim_whatsapp_inbox_leased(integer, text, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.get_upcoming_appointment_by_phone(text) to service_role;
    grant execute on function public.is_whatsapp_conversation_paused(text) to service_role;
    grant execute on function public.register_whatsapp_from_me_activity(text, text, text, integer) to service_role;
    grant execute on function public.claim_notification_outbox_leased(integer, text, integer) to service_role;
    grant execute on function public.claim_whatsapp_inbox_leased(integer, text, integer) to service_role;
  end if;
end;
$$;
