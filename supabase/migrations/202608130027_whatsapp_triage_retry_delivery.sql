-- Retry, compare-and-set and delivery guarantees for definitive WhatsApp
-- routing. This is additive over 024--026 so an already upgraded local
-- catalog receives the same safety properties as a fresh installation.

alter table public.whatsapp_plan_triage_sessions
  add column if not exists accepted_by_inbox_id uuid;

alter table public.whatsapp_plan_triage_sessions
  add column if not exists accepted_patient_updated_at timestamptz;

create table if not exists public.whatsapp_access_link_deliveries (
  source_inbox_id uuid primary key references public.whatsapp_inbox(id) on delete restrict,
  phone text not null check (phone ~ '^[0-9]{12,15}$'),
  access_token_id uuid not null unique references public.access_tokens(id) on delete restrict,
  encrypted_token text not null check (char_length(encrypted_token) >= 32),
  created_at timestamptz not null default now()
);

alter table public.whatsapp_access_link_deliveries enable row level security;
alter table public.whatsapp_access_link_deliveries force row level security;

-- Reconcile every historic spelling, including the legacy canonical
-- Odontopreve row. Normalized comparison protects upgrades containing accents
-- or casing differences while the destination remains the authoritative Rede
-- UNNA record.
create or replace function public.reconcile_rede_unna_legacy_catalog()
returns void
language plpgsql
set search_path = public
as $$
declare
  rede_unna_id uuid;
  legacy_plan_ids uuid[];
begin
  perform 1
  from public.insurance_plans
  where public.normalize_public_plan_term(name) in (
    'rede unna', 'odontoprev', 'odontopreve', 'bradesco dental', 'bb dental', 'previan'
  )
  for update;

  select id into rede_unna_id
  from public.insurance_plans
  where public.normalize_public_plan_term(name) = 'rede unna'
    and active;

  select array_agg(id order by id)
  into legacy_plan_ids
  from public.insurance_plans
  where public.normalize_public_plan_term(name) in (
    'odontoprev', 'odontopreve', 'bradesco dental', 'bb dental', 'previan'
  )
    and id is distinct from rede_unna_id;

  if coalesce(array_length(legacy_plan_ids, 1), 0) > 0 and rede_unna_id is null then
    raise exception 'REDE_UNNA_PLAN_REQUIRED';
  end if;
  if rede_unna_id is null or coalesce(array_length(legacy_plan_ids, 1), 0) = 0 then
    return;
  end if;

  if exists (
    select 1
    from public.procedure_coverage coverage
    where coverage.insurance_plan_id = rede_unna_id
       or coverage.insurance_plan_id = any(legacy_plan_ids)
    group by coverage.procedure_id
    having count(distinct jsonb_build_object(
      'accepted', coverage.accepted,
      'instructions', coverage.instructions
    )) > 1
  ) then
    raise exception 'REDE_UNNA_COVERAGE_CONFLICT';
  end if;

  with ranked_coverage as (
    select coverage.id,
           row_number() over (
             partition by coverage.procedure_id
             order by (coverage.insurance_plan_id = rede_unna_id) desc,
                      coverage.created_at,
                      coverage.id
           ) as ordinal
    from public.procedure_coverage coverage
    where coverage.insurance_plan_id = rede_unna_id
       or coverage.insurance_plan_id = any(legacy_plan_ids)
  )
  delete from public.procedure_coverage coverage
  using ranked_coverage
  where coverage.id = ranked_coverage.id
    and ranked_coverage.ordinal > 1;

  update public.procedure_coverage
  set insurance_plan_id = rede_unna_id
  where insurance_plan_id = any(legacy_plan_ids);

  update public.patients
  set insurance_plan_id = rede_unna_id
  where insurance_plan_id = any(legacy_plan_ids);

  update public.appointments
  set insurance_plan_id = rede_unna_id
  where insurance_plan_id = any(legacy_plan_ids);

  update public.whatsapp_plan_triage_sessions
  set insurance_plan_id = rede_unna_id
  where insurance_plan_id = any(legacy_plan_ids);

  update public.insurance_plans
  set active = false
  where id = any(legacy_plan_ids)
    and active;
end;
$$;

select public.reconcile_rede_unna_legacy_catalog();

insert into public.insurance_aliases (insurance_plan_id, alias, active)
select plan.id, term.alias, true
from public.insurance_plans plan
cross join (values
  ('Bradesco Dental'),
  ('Odontoprev'),
  ('Odontopreve'),
  ('BB Dental'),
  ('Previan')
) as term(alias)
where public.normalize_public_plan_term(plan.name) = 'rede unna'
  and plan.active
on conflict (insurance_plan_id, alias) do update
set active = true;

-- All changes to a phone's triage state share this lock with acceptance.
-- `replace` is used only to create/supersede an unaccepted prompt; it can
-- never overwrite an accepted state that another worker committed first.
create or replace function public.transition_whatsapp_plan_triage(
  p_phone text,
  p_action text,
  p_pending_message text,
  p_prompted_by_inbox_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  triage public.whatsapp_plan_triage_sessions%rowtype;
begin
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;
  if p_action not in ('begin', 'replace', 'reject', 'expire') then
    raise exception 'INVALID_TRIAGE_TRANSITION';
  end if;
  if p_prompted_by_inbox_id is null then raise exception 'INVALID_TRIAGE_PROMPT'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_phone, 0));
  select * into triage
  from public.whatsapp_plan_triage_sessions
  where phone = p_phone
  for update;

  if p_action in ('begin', 'replace') then
    if char_length(trim(coalesce(p_pending_message, ''))) not between 1 and 4000 then
      raise exception 'INVALID_PENDING_MESSAGE';
    end if;
    if found and triage.status = 'accepted' and triage.expires_at > now() then
      return false;
    end if;
    if p_action = 'begin' and found and triage.status = 'awaiting_plan'
       and triage.expires_at > now() and triage.prompted_by_inbox_id is distinct from p_prompted_by_inbox_id then
      return false;
    end if;
    if found and triage.status = 'awaiting_plan'
       and triage.prompted_by_inbox_id = p_prompted_by_inbox_id
       and triage.pending_message = p_pending_message
       and triage.expires_at > now() then
      return true;
    end if;

    insert into public.whatsapp_plan_triage_sessions (
      phone, status, pending_message, prompted_by_inbox_id, insurance_plan_id, accepted_by_inbox_id, accepted_patient_updated_at, expires_at
    ) values (
      p_phone, 'awaiting_plan', p_pending_message, p_prompted_by_inbox_id, null, null, null, now() + interval '24 hours'
    )
    on conflict (phone) do update
    set status = 'awaiting_plan',
        pending_message = excluded.pending_message,
        prompted_by_inbox_id = excluded.prompted_by_inbox_id,
        insurance_plan_id = null,
        accepted_by_inbox_id = null,
        accepted_patient_updated_at = null,
        expires_at = excluded.expires_at,
        updated_at = now();
    return true;
  end if;

  if not found
     or triage.status = 'accepted'
     or triage.prompted_by_inbox_id is distinct from p_prompted_by_inbox_id then
    return false;
  end if;

  update public.whatsapp_plan_triage_sessions
  set status = 'rejected',
      insurance_plan_id = null,
      accepted_by_inbox_id = null,
      accepted_patient_updated_at = null,
      expires_at = now(),
      updated_at = now()
  where phone = p_phone
    and status in ('awaiting_plan', 'rejected')
    and prompted_by_inbox_id = p_prompted_by_inbox_id;
  return found;
end;
$$;

drop function if exists public.accept_whatsapp_plan_triage(text, uuid, uuid);

create function public.accept_whatsapp_plan_triage(
  p_phone text,
  p_insurance_plan_id uuid,
  p_prompted_by_inbox_id uuid,
  p_answer_inbox_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  triage public.whatsapp_plan_triage_sessions%rowtype;
  patient_plan_id uuid;
  patient_updated_at timestamptz;
begin
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;
  if p_prompted_by_inbox_id is null or p_answer_inbox_id is null then
    raise exception 'INVALID_TRIAGE_PROMPT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_phone, 0));

  perform 1
  from public.whatsapp_inbox
  where id = p_prompted_by_inbox_id
    and phone = p_phone
  for key share;
  if not found then raise exception 'TRIAGE_PROMPT_INBOX_INVALID'; end if;

  perform 1
  from public.whatsapp_inbox
  where id = p_answer_inbox_id
    and phone = p_phone
  for key share;
  if not found then raise exception 'TRIAGE_ANSWER_INBOX_INVALID'; end if;

  select * into triage
  from public.whatsapp_plan_triage_sessions
  where phone = p_phone
  for update;
  if not found or triage.expires_at <= now() then raise exception 'STALE_TRIAGE_PROMPT'; end if;

  -- Every accepted replay rechecks the durable patient profile and locks the
  -- selected plan, so deactivation or a concurrent profile edit fails closed.
  perform 1
  from public.insurance_plans
  where id = p_insurance_plan_id
    and active
  for update;
  if not found then raise exception 'PLAN_NOT_ACTIVE'; end if;

  if triage.status = 'accepted' then
    if triage.prompted_by_inbox_id is distinct from p_prompted_by_inbox_id
       or triage.accepted_by_inbox_id is distinct from p_answer_inbox_id
       or triage.insurance_plan_id is distinct from p_insurance_plan_id then
      raise exception 'STALE_TRIAGE_PROMPT';
    end if;

    select insurance_plan_id, updated_at into patient_plan_id, patient_updated_at
    from public.patients
    where phone = p_phone
    for update;
    if patient_plan_id is distinct from p_insurance_plan_id
       or patient_updated_at is distinct from triage.accepted_patient_updated_at then
      raise exception 'TRIAGE_PROFILE_INCOMPLETE';
    end if;
    return true;
  end if;

  if triage.status is distinct from 'awaiting_plan'
     or triage.prompted_by_inbox_id is distinct from p_prompted_by_inbox_id then
    raise exception 'STALE_TRIAGE_PROMPT';
  end if;

  insert into public.patients (phone, insurance_plan_id)
  values (p_phone, p_insurance_plan_id)
  on conflict (phone) do update
  set insurance_plan_id = excluded.insurance_plan_id,
      updated_at = now()
  returning updated_at into patient_updated_at;

  update public.whatsapp_plan_triage_sessions
  set status = 'accepted',
      insurance_plan_id = p_insurance_plan_id,
      accepted_by_inbox_id = p_answer_inbox_id,
      accepted_patient_updated_at = patient_updated_at,
      expires_at = now() + interval '24 hours',
      updated_at = now()
  where phone = p_phone;
  return true;
end;
$$;

-- The worker encrypts the opaque token with the existing AES-GCM secret and
-- this RPC stores token, delivery and retry key in one transaction. PostgreSQL
-- cannot guarantee an external provider's exactly-once delivery without that
-- provider's idempotency key; it does guarantee one reusable URL per inbox.
create or replace function public.prepare_whatsapp_access_link(
  p_phone text,
  p_source_inbox_id uuid,
  p_token_hash text,
  p_encrypted_token text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_encrypted_token text;
  saved_token_id uuid;
begin
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;
  if p_source_inbox_id is null then raise exception 'INVALID_LINK_SOURCE'; end if;
  if char_length(trim(coalesce(p_token_hash, ''))) < 32 then raise exception 'INVALID_LINK_TOKEN'; end if;
  if char_length(trim(coalesce(p_encrypted_token, ''))) < 32 then raise exception 'INVALID_LINK_TOKEN'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_source_inbox_id::text, 0));
  perform 1
  from public.whatsapp_inbox
  where id = p_source_inbox_id
    and phone = p_phone
  for key share;
  if not found then raise exception 'LINK_SOURCE_INBOX_INVALID'; end if;

  select encrypted_token into saved_encrypted_token
  from public.whatsapp_access_link_deliveries
  where source_inbox_id = p_source_inbox_id
  for update;
  if found then return saved_encrypted_token; end if;

  insert into public.access_tokens (phone, token_hash, origin, expires_at)
  values (p_phone, p_token_hash, 'whatsapp_link', now() + interval '24 hours')
  returning id into saved_token_id;

  insert into public.whatsapp_access_link_deliveries (
    source_inbox_id, phone, access_token_id, encrypted_token
  ) values (
    p_source_inbox_id, p_phone, saved_token_id, p_encrypted_token
  );
  return p_encrypted_token;
end;
$$;

create or replace function public.whatsapp_routing_schema_ready()
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if to_regclass('public.insurance_aliases_active_normalized_term_uniq') is null
     or to_regclass('public.whatsapp_access_link_deliveries') is null
     or to_regprocedure('public.transition_whatsapp_plan_triage(text,text,text,uuid)') is null
     or to_regprocedure('public.accept_whatsapp_plan_triage(text,uuid,uuid,uuid)') is null
     or to_regprocedure('public.prepare_whatsapp_access_link(text,uuid,text,text)') is null
     or not exists (
       select 1 from pg_attribute
       where attrelid = 'public.insurance_aliases'::regclass
         and attname = 'normalized_alias'
         and not attisdropped
     )
     or not exists (
       select 1 from pg_attribute
       where attrelid = 'public.whatsapp_plan_triage_sessions'::regclass
         and attname = 'accepted_by_inbox_id'
         and not attisdropped
     )
     or not exists (
       select 1 from pg_attribute
       where attrelid = 'public.whatsapp_plan_triage_sessions'::regclass
         and attname = 'accepted_patient_updated_at'
         and not attisdropped
     )
     or not exists (
       select 1 from pg_index
       where indexrelid = 'public.insurance_aliases_active_normalized_term_uniq'::regclass
         and indisunique
         and indisvalid
         and indpred is not null
     ) then
    return false;
  end if;

  perform public.assert_active_insurance_plan_catalog();
  if exists (
    select 1
    from public.insurance_aliases alias
    where alias.active
      and alias.normalized_alias <> public.normalize_public_plan_term(alias.alias)
  ) or exists (
    select alias.normalized_alias
    from public.insurance_aliases alias
    where alias.active
    group by alias.normalized_alias
    having count(*) > 1
  ) or exists (
    select 1
    from public.insurance_plans plan
    where plan.active
      and not exists (
        select 1
        from public.insurance_aliases alias
        where alias.insurance_plan_id = plan.id
          and alias.active
          and alias.is_canonical
          and alias.normalized_alias = public.normalize_public_plan_term(plan.name)
      )
  ) then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.transition_whatsapp_plan_triage(text, text, text, uuid) from public;
revoke all on function public.accept_whatsapp_plan_triage(text, uuid, uuid, uuid) from public;
revoke all on function public.prepare_whatsapp_access_link(text, uuid, text, text) from public;
revoke all on function public.whatsapp_routing_schema_ready() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.transition_whatsapp_plan_triage(text, text, text, uuid) to service_role;
    grant execute on function public.accept_whatsapp_plan_triage(text, uuid, uuid, uuid) to service_role;
    grant execute on function public.prepare_whatsapp_access_link(text, uuid, text, text) to service_role;
    grant execute on function public.whatsapp_routing_schema_ready() to service_role;
  end if;
end;
$$;
