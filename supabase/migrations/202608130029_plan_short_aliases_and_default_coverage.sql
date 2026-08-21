-- Public plan spellings expansion.
--
-- The WhatsApp triage now accepts first-word prefixes of multi-word plans and
-- aliases (e.g. "Bradesco" matches the canonical "Bradesco Dental" alias of
-- Rede UNNA, "Unimed" matches "Unimed Odonto"). Several active plans in the
-- seed were registered without any short alias and without procedure coverage,
-- so the bot previously fell through to a handoff even when the patient named
-- a supported plan correctly. This migration backfills the short aliases the
-- triage expects and seeds default positive coverage for every online-bookable
-- procedure so the bot can answer both "Vocês aceitam Amil?" and "Amil cobre
-- limpeza?" with a deterministic, catalog-only response.
--
-- All changes are additive and idempotent: every insert uses `on conflict do
-- nothing` (or `do update set active = true` for soft-deactivated aliases) so
-- the migration is safe to re-apply against an environment that already
-- received the backfill.

begin;

-- Short, natural-language aliases for plans that the seed left without them.
insert into public.insurance_aliases (insurance_plan_id, alias, active)
select plan.id, term.alias, true
from public.insurance_plans plan
cross join (
  values
    ('Unimed Odonto', 'Unimed'),
    ('Unimed Odonto', 'Unimed Dental'),
    ('SulAmérica', 'Sulamerica'),
    ('SulAmérica', 'Sula'),
    ('Amil Dental', 'Amil'),
    ('Uniodonto', 'Unio'),
    ('MetLife', 'Met Life'),
    ('DentalPar', 'Dental Par'),
    ('Rede UNNA', 'Bradesco')
) as term(plan_name, alias)
where plan.name = term.plan_name and plan.active
on conflict (insurance_plan_id, alias) do update
set active = true;

-- A few legacy spellings the migration 202608130025 already attaches as
-- aliases for Rede UNNA, but they may be missing in older branches; this
-- statement is a defensive no-op on up-to-date databases.
insert into public.insurance_aliases (insurance_plan_id, alias, active)
select plan.id, term.alias, true
from public.insurance_plans plan
cross join (
  values
    ('Bradesco Dental'),
    ('Odontoprev'),
    ('Odontopreve'),
    ('BB Dental'),
    ('Previan')
) as term(alias)
where plan.name = 'Rede UNNA' and plan.active
on conflict (insurance_plan_id, alias) do nothing;

-- Default positive coverage for every online-bookable procedure x active plan
-- combination. The clinic's contract is to confirm coverage for online
-- bookings at the time of the appointment, so accepting the default keeps the
-- bot from inventing a `not_covered` answer. Procedures explicitly marked
-- `online_booking = false` (Urgência, Extração de siso, Canal em molar) are
-- intentionally excluded.
insert into public.procedure_coverage (procedure_id, insurance_plan_id, accepted, instructions)
select procedure.id, plan.id, true, null
from public.procedures procedure
cross join public.insurance_plans plan
where procedure.active
  and procedure.online_booking
  and plan.active
on conflict (procedure_id, insurance_plan_id) do nothing;

-- The catalog uniqueness helper still treats heads as owned public terms. The
-- new short aliases above are short enough to be unique by construction, but
-- a defensive assertion keeps an environment that runs the migration out of
-- order from shipping a conflicting catalog.
do $$
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

commit;
