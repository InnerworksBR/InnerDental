-- Final safety gates for the definitive WhatsApp routing rollout. This
-- migration replaces the provisional acceptance RPC from 025 with a contract
-- that derives pending state and expiry from the database itself.

drop function if exists public.accept_whatsapp_plan_triage(text, uuid, text, uuid, timestamptz);

create or replace function public.accept_whatsapp_plan_triage(
  p_phone text,
  p_insurance_plan_id uuid,
  p_prompted_by_inbox_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  triage public.whatsapp_plan_triage_sessions%rowtype;
  patient_plan_id uuid;
begin
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;

  -- Every contender for one patient's prompt waits at this boundary. The row
  -- lock also makes a newer/superseding prompt visible before acceptance.
  perform pg_advisory_xact_lock(hashtextextended(p_phone, 0));

  select * into triage
  from public.whatsapp_plan_triage_sessions
  where phone = p_phone
  for update;

  if not found then raise exception 'TRIAGE_PROMPT_NOT_FOUND'; end if;
  if triage.expires_at <= now() then raise exception 'STALE_TRIAGE_PROMPT'; end if;

  if triage.status = 'accepted' then
    if triage.prompted_by_inbox_id is distinct from p_prompted_by_inbox_id
       or triage.insurance_plan_id is distinct from p_insurance_plan_id then
      raise exception 'STALE_TRIAGE_PROMPT';
    end if;

    -- An exact retry is safe only if the atomic profile write is still present.
    select insurance_plan_id into patient_plan_id
    from public.patients
    where phone = p_phone
    for key share;
    if patient_plan_id is distinct from p_insurance_plan_id then
      raise exception 'TRIAGE_PROFILE_INCOMPLETE';
    end if;
    return true;
  end if;

  if triage.status is distinct from 'awaiting_plan'
     or triage.prompted_by_inbox_id is distinct from p_prompted_by_inbox_id then
    raise exception 'STALE_TRIAGE_PROMPT';
  end if;

  -- FOR UPDATE is deliberately stronger than FOR KEY SHARE: deactivation of
  -- the selected plan must wait until the accepted session and patient profile
  -- commit together.
  perform 1
  from public.insurance_plans
  where id = p_insurance_plan_id
    and active
  for update;
  if not found then raise exception 'PLAN_NOT_ACTIVE'; end if;

  insert into public.patients (phone, insurance_plan_id)
  values (p_phone, p_insurance_plan_id)
  on conflict (phone) do update
  set insurance_plan_id = excluded.insurance_plan_id,
      updated_at = now();

  update public.whatsapp_plan_triage_sessions
  set status = 'accepted',
      insurance_plan_id = p_insurance_plan_id,
      -- The server, not a caller clock, owns the accepted-session lifetime.
      expires_at = now() + interval '24 hours',
      updated_at = now()
  where phone = p_phone;

  return true;
end;
$$;

-- Readiness must prove the schema required by this web/worker version, not
-- merely prove that an older database accepts a basic SELECT. Besides the
-- application assertion, inspect and query the physical normalized-term
-- registry protected by the partial unique index from migration 025.
create or replace function public.whatsapp_routing_schema_ready()
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if to_regclass('public.insurance_aliases_active_normalized_term_uniq') is null
     or not exists (
       select 1
       from pg_attribute
       where attrelid = 'public.insurance_aliases'::regclass
         and attname = 'normalized_alias'
         and not attisdropped
     )
     or not exists (
       select 1
       from pg_attribute
       where attrelid = 'public.insurance_aliases'::regclass
         and attname = 'is_canonical'
         and not attisdropped
     )
     or not exists (
       select 1
       from pg_index
       where indexrelid = 'public.insurance_aliases_active_normalized_term_uniq'::regclass
         and indisunique
         and indisvalid
         and indpred is not null
     ) then
    return false;
  end if;

  perform public.assert_active_insurance_plan_catalog();

  -- This is an actual query of the generated registry representation, rather
  -- than a source-version comparison. Both uniqueness and canonical self-term
  -- ownership must be observable in the installed schema.
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

revoke all on function public.accept_whatsapp_plan_triage(text, uuid, uuid) from public;
revoke all on function public.whatsapp_routing_schema_ready() from public;
revoke all on function public.reconcile_rede_unna_legacy_catalog() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.accept_whatsapp_plan_triage(text, uuid, uuid) to service_role;
    grant execute on function public.whatsapp_routing_schema_ready() to service_role;

    -- Trigger functions are not an application RPC surface. The service role
    -- keeps only the nested helpers it needs through the two real RPCs above.
    revoke all on function public.enforce_insurance_alias_owner() from service_role;
    revoke all on function public.sync_insurance_plan_canonical_alias() from service_role;
  end if;
end;
$$;
