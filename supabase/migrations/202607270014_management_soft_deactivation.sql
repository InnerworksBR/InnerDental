-- Desativação lógica para configurações que antes só podiam ser removidas.
-- Aditiva: registros existentes permanecem ativos.

alter table public.insurance_aliases
  add column if not exists active boolean not null default true;

alter table public.availability_exceptions
  add column if not exists active boolean not null default true;

create index if not exists insurance_aliases_active_lookup_idx
  on public.insurance_aliases (lower(alias))
  where active;

create index if not exists availability_exceptions_active_professional_date_idx
  on public.availability_exceptions (professional_id, date)
  where active;

create or replace function public.replace_availability_rules(
  p_professional_id uuid,
  p_periods jsonb
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if jsonb_typeof(p_periods) <> 'array' then
    raise exception 'PERIODS_MUST_BE_ARRAY';
  end if;

  update public.availability_rules
     set active = false
   where professional_id = p_professional_id
     and active;

  insert into public.availability_rules (
    professional_id, weekday, start_time, end_time, slot_duration, active
  )
  select
    p_professional_id,
    period.weekday,
    period.start_time,
    period.end_time,
    15,
    true
  from jsonb_to_recordset(p_periods) as period(
    weekday smallint,
    start_time time,
    end_time time
  )
  on conflict (professional_id, weekday, start_time, end_time)
  do update set active = true, updated_at = now();
end;
$$;
