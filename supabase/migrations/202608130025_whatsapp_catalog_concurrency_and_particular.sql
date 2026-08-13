-- Hardening for the definitive WhatsApp routing migration. Public plan terms
-- are owned by a physical unique key, and accepted plan triage is atomic.

begin;

-- Earlier local iterations used statement triggers for this assertion. They
-- are useful diagnostics but cannot serialize two concurrent transactions.
drop trigger if exists insurance_plans_catalog_integrity on public.insurance_plans;
drop trigger if exists insurance_aliases_catalog_integrity on public.insurance_aliases;

create or replace function public.assert_active_insurance_plan_catalog()
returns void
language plpgsql
set search_path = public
as $$
declare
  conflicting_terms text;
begin
  select string_agg(term, ', ' order by term)
  into conflicting_terms
  from (
    select term
    from (
      select public.normalize_public_plan_term(plan.name) as term, plan.id as plan_id
      from public.insurance_plans plan
      where plan.active

      union all

      select public.normalize_public_plan_term(alias.alias) as term, alias.insurance_plan_id as plan_id
      from public.insurance_aliases alias
      join public.insurance_plans plan on plan.id = alias.insurance_plan_id
      where alias.active and plan.active
    ) public_terms
    where term <> ''
    group by term
    having count(distinct plan_id) > 1
  ) conflicts;

  if conflicting_terms is not null then
    raise exception 'PLAN_CATALOG_CONFLICT: %', conflicting_terms;
  end if;
end;
$$;

-- Particular is a first-class active plan. This is harmless on an empty
-- database (the seed runs later) and repairs existing installations safely.
insert into public.insurance_plans (name, active, instructions)
values ('Particular', true, null)
on conflict (name) do update
set active = true;

-- The authoritative PRD maps these public names to Rede UNNA. The complete
-- coverage set is checked before *any* reference moves, then one compatible
-- row per procedure is kept. Keeping this as a helper lets the disposable
-- PostgreSQL regression exercise the same migration path on fixtures.
create or replace function public.reconcile_rede_unna_legacy_catalog()
returns void
language plpgsql
set search_path = public
as $$
declare
  rede_unna_id uuid;
  legacy_plan_ids uuid[];
begin
  -- Lock the whole ownership set before reading it. This also keeps a
  -- concurrent plan edit from changing the migration's source set mid-flight.
  perform 1
  from public.insurance_plans
  where name in ('Rede UNNA', 'Odontoprev', 'Odontopreve', 'Bradesco Dental', 'BB Dental', 'Previan')
  for update;

  select id into rede_unna_id
  from public.insurance_plans
  where name = 'Rede UNNA' and active;

  select array_agg(id order by id)
  into legacy_plan_ids
  from public.insurance_plans
  where name in ('Odontoprev', 'Odontopreve', 'Bradesco Dental', 'BB Dental', 'Previan')
    and id is distinct from rede_unna_id;

  if coalesce(array_length(legacy_plan_ids, 1), 0) > 0 and rede_unna_id is null then
    raise exception 'REDE_UNNA_PLAN_REQUIRED';
  end if;
  if rede_unna_id is null or coalesce(array_length(legacy_plan_ids, 1), 0) = 0 then
    return;
  end if;

  -- Compare Rede UNNA and every duplicate together. Pairwise comparison only
  -- with an existing Rede UNNA row misses two compatible legacy rows for a
  -- procedure that Rede UNNA did not yet have.
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

  -- The preflight makes every duplicate fact equivalent. Prefer an existing
  -- Rede UNNA row; otherwise retain exactly one legacy row before changing it
  -- to Rede UNNA, preventing the (procedure_id, insurance_plan_id) key from
  -- rejecting compatible legacy-only coverage.
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

-- These are the exact public spellings registered by the product contract.
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
where plan.name = 'Rede UNNA' and plan.active
on conflict (insurance_plan_id, alias) do update
set active = true;

-- An inactive plan has no public terms. Clearing stale aliases also lets a
-- subsequently active owner claim the term through the unique registry.
update public.insurance_aliases alias
set active = false
from public.insurance_plans plan
where alias.insurance_plan_id = plan.id
  and alias.active
  and not plan.active;

alter table public.insurance_aliases
  add column if not exists is_canonical boolean not null default false;

alter table public.insurance_aliases
  add column if not exists normalized_alias text generated always as (public.normalize_public_plan_term(alias)) stored;

-- The diagnostic assertion catches divergent production data before its
-- physical constraint is installed. Equivalent rows owned by the same plan
-- are safely collapsed to one active spelling.
select public.assert_active_insurance_plan_catalog();

-- This setting is only consumed by the maintenance trigger below when this
-- migration is re-executed. It keeps the canonical self-alias intact against
-- ordinary direct updates.
select set_config('luna.allow_canonical_alias_sync', 'on', true);
update public.insurance_aliases
set is_canonical = false
where is_canonical;
select set_config('luna.allow_canonical_alias_sync', 'off', true);

insert into public.insurance_aliases (insurance_plan_id, alias, active, is_canonical)
select id, name, true, true
from public.insurance_plans
where active
on conflict (insurance_plan_id, alias) do update
set active = true,
    is_canonical = true;

with ranked as (
  select alias.id,
         row_number() over (
           partition by alias.normalized_alias
           order by alias.is_canonical desc, alias.created_at, alias.id
         ) as ordinal
  from public.insurance_aliases alias
  where alias.active
)
update public.insurance_aliases alias
set active = false,
    is_canonical = false
from ranked
where alias.id = ranked.id
  and ranked.ordinal > 1;

-- This partial UNIQUE index is the concurrency boundary. Canonical self-alias
-- rows put plan names in the same registry as ordinary aliases, so two
-- writers cannot both commit different owners for one normalized public term.
create unique index if not exists insurance_aliases_active_normalized_term_uniq
  on public.insurance_aliases (normalized_alias)
  where active;

create unique index if not exists insurance_aliases_one_canonical_per_plan_uniq
  on public.insurance_aliases (insurance_plan_id)
  where is_canonical;

create or replace function public.enforce_insurance_alias_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owner_name text;
  owner_active boolean;
begin
  if tg_op = 'DELETE' then
    if old.is_canonical then
      raise exception 'CANONICAL_PLAN_TERM_REQUIRED';
    end if;
    return old;
  end if;

  select name, active into owner_name, owner_active
  from public.insurance_plans
  where id = new.insurance_plan_id;

  if owner_name is null then
    raise exception 'PLAN_NOT_FOUND';
  end if;

  if new.is_canonical then
    if public.normalize_public_plan_term(new.alias) <> public.normalize_public_plan_term(owner_name) then
      raise exception 'CANONICAL_PLAN_TERM_INVALID';
    end if;
    if owner_active and not new.active then
      raise exception 'CANONICAL_PLAN_TERM_REQUIRED';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.is_canonical
     and not new.is_canonical
     and current_setting('luna.allow_canonical_alias_sync', true) is distinct from 'on' then
    raise exception 'CANONICAL_PLAN_TERM_REQUIRED';
  end if;

  if not owner_active then
    new.active := false;
  end if;
  return new;
end;
$$;

create or replace function public.sync_insurance_plan_canonical_alias()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  canonical_alias_id uuid;
begin
  if not new.active then
    update public.insurance_aliases
    set active = false
    where insurance_plan_id = new.id
      and active;
    return new;
  end if;

  -- Free the old canonical row before adopting an existing spelling or adding
  -- the current name. The surrounding transaction rolls back on any unique
  -- conflict with a different active plan.
  perform set_config('luna.allow_canonical_alias_sync', 'on', true);
  update public.insurance_aliases
  set active = false,
      is_canonical = false
  where insurance_plan_id = new.id
    and is_canonical;

  with candidate as (
    select id
    from public.insurance_aliases
    where insurance_plan_id = new.id
      and normalized_alias = public.normalize_public_plan_term(new.name)
    order by (alias = new.name) desc, created_at, id
    limit 1
  )
  update public.insurance_aliases alias
  set alias = new.name,
      active = true,
      is_canonical = true
  from candidate
  where alias.id = candidate.id
  returning alias.id into canonical_alias_id;

  if canonical_alias_id is null then
    insert into public.insurance_aliases (insurance_plan_id, alias, active, is_canonical)
    values (new.id, new.name, true, true);
  end if;
  perform set_config('luna.allow_canonical_alias_sync', 'off', true);
  return new;
end;
$$;

drop trigger if exists insurance_aliases_enforce_public_term_owner on public.insurance_aliases;
create trigger insurance_aliases_enforce_public_term_owner
before insert or update or delete on public.insurance_aliases
for each row execute function public.enforce_insurance_alias_owner();

drop trigger if exists insurance_plans_sync_canonical_alias on public.insurance_plans;
create trigger insurance_plans_sync_canonical_alias
after insert or update of name, active on public.insurance_plans
for each row execute function public.sync_insurance_plan_canonical_alias();

-- The worker must make the patient profile and accepted session durable as a
-- single unit before it can send a booking link.
create or replace function public.accept_whatsapp_plan_triage(
  p_phone text,
  p_insurance_plan_id uuid,
  p_pending_message text,
  p_prompted_by_inbox_id uuid,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;
  if char_length(trim(p_pending_message)) < 1 or char_length(p_pending_message) > 4000 then raise exception 'INVALID_PENDING_MESSAGE'; end if;
  if p_expires_at <= now() then raise exception 'INVALID_TRIAGE_EXPIRATION'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_phone, 0));

  perform 1
  from public.insurance_plans
  where id = p_insurance_plan_id
    and active
  for key share;
  if not found then raise exception 'PLAN_NOT_ACTIVE'; end if;

  insert into public.patients (phone, insurance_plan_id)
  values (p_phone, p_insurance_plan_id)
  on conflict (phone) do update
  set insurance_plan_id = excluded.insurance_plan_id,
      updated_at = now();

  insert into public.whatsapp_plan_triage_sessions (
    phone, status, pending_message, prompted_by_inbox_id, insurance_plan_id, expires_at
  ) values (
    p_phone, 'accepted', p_pending_message, p_prompted_by_inbox_id, p_insurance_plan_id, p_expires_at
  )
  on conflict (phone) do update
  set status = 'accepted',
      pending_message = excluded.pending_message,
      prompted_by_inbox_id = excluded.prompted_by_inbox_id,
      insurance_plan_id = excluded.insurance_plan_id,
      expires_at = excluded.expires_at,
      updated_at = now();

  return true;
end;
$$;

-- This is the only administrative path that changes a plan's canonical name
-- and its complete alias set. A failed ownership check rolls back all writes.
create or replace function public.save_insurance_plan_catalog(
  p_plan_id uuid,
  p_name text,
  p_instructions text,
  p_active boolean,
  p_aliases text[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_plan_id uuid;
  clean_name text := trim(coalesce(p_name, ''));
  clean_alias text;
  normalized_name text;
begin
  if char_length(clean_name) < 1 or char_length(clean_name) > 120 then
    raise exception 'INVALID_PLAN_NAME';
  end if;
  if p_aliases is null then p_aliases := '{}'; end if;
  if cardinality(p_aliases) > 30 then raise exception 'TOO_MANY_PLAN_ALIASES'; end if;

  normalized_name := public.normalize_public_plan_term(clean_name);
  if exists (
    select 1
    from (
      select public.normalize_public_plan_term(trim(alias)) as normalized_alias
      from unnest(p_aliases) as alias
    ) aliases
    group by normalized_alias
    having count(*) > 1 or bool_or(normalized_alias = '')
  ) then
    raise exception 'PLAN_ALIAS_DUPLICATE';
  end if;

  if exists (
    select 1
    from unnest(p_aliases) as alias
    where char_length(trim(alias)) < 1
       or char_length(trim(alias)) > 120
       or public.normalize_public_plan_term(trim(alias)) = normalized_name
  ) then
    raise exception 'PLAN_ALIAS_INVALID';
  end if;

  if p_plan_id is null then
    insert into public.insurance_plans (name, instructions, active)
    values (clean_name, p_instructions, p_active)
    returning id into saved_plan_id;
  else
    update public.insurance_plans
    set name = clean_name,
        instructions = p_instructions,
        active = p_active
    where id = p_plan_id
    returning id into saved_plan_id;
    if saved_plan_id is null then raise exception 'PLAN_NOT_FOUND'; end if;
  end if;

  update public.insurance_aliases
  set active = false
  where insurance_plan_id = saved_plan_id
    and not is_canonical
    and active;

  foreach clean_alias in array p_aliases loop
    clean_alias := trim(clean_alias);
    with candidate as (
      select id
      from public.insurance_aliases
      where insurance_plan_id = saved_plan_id
        and not is_canonical
        and normalized_alias = public.normalize_public_plan_term(clean_alias)
      order by (alias = clean_alias) desc, created_at, id
      limit 1
    )
    update public.insurance_aliases alias
    set alias = clean_alias,
        active = p_active,
        is_canonical = false
    from candidate
    where alias.id = candidate.id;

    if not found then
      insert into public.insurance_aliases (insurance_plan_id, alias, active, is_canonical)
      values (saved_plan_id, clean_alias, p_active, false);
    end if;
  end loop;

  perform public.assert_active_insurance_plan_catalog();
  return saved_plan_id;
end;
$$;

select public.assert_active_insurance_plan_catalog();

revoke all on function public.normalize_public_plan_term(text) from public;
revoke all on function public.assert_active_insurance_plan_catalog() from public;
revoke all on function public.reconcile_rede_unna_legacy_catalog() from public;
revoke all on function public.enforce_insurance_alias_owner() from public;
revoke all on function public.sync_insurance_plan_canonical_alias() from public;
revoke all on function public.accept_whatsapp_plan_triage(text, uuid, text, uuid, timestamptz) from public;
revoke all on function public.save_insurance_plan_catalog(uuid, text, text, boolean, text[]) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.normalize_public_plan_term(text) to service_role;
    grant execute on function public.assert_active_insurance_plan_catalog() to service_role;
    grant execute on function public.enforce_insurance_alias_owner() to service_role;
    grant execute on function public.sync_insurance_plan_canonical_alias() to service_role;
    grant execute on function public.accept_whatsapp_plan_triage(text, uuid, text, uuid, timestamptz) to service_role;
    grant execute on function public.save_insurance_plan_catalog(uuid, text, text, boolean, text[]) to service_role;
  end if;
end;
$$;

commit;
