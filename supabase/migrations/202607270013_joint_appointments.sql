-- Expande consultas e holds para 15/30 minutos e impede sobreposição ativa.
-- Aplicar em janela controlada: exclusion constraints validam as linhas existentes.
create extension if not exists btree_gist;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
      from pg_constraint
     where conrelid = 'public.appointments'::regclass
       and contype = 'c'
       and position('end_at - start_at' in pg_get_constraintdef(oid)) > 0
  loop
    execute format('alter table public.appointments drop constraint %I', constraint_name);
  end loop;

  for constraint_name in
    select conname
      from pg_constraint
     where conrelid = 'public.slot_holds'::regclass
       and contype = 'c'
       and position('end_at - start_at' in pg_get_constraintdef(oid)) > 0
  loop
    execute format('alter table public.slot_holds drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.appointments
  add constraint appointments_supported_duration
  check (end_at - start_at in (interval '15 minutes', interval '30 minutes')) not valid;

alter table public.slot_holds
  add constraint slot_holds_supported_duration
  check (end_at - start_at in (interval '15 minutes', interval '30 minutes')) not valid;

alter table public.appointments validate constraint appointments_supported_duration;
alter table public.slot_holds validate constraint slot_holds_supported_duration;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.appointments'::regclass
       and conname = 'appointments_no_active_overlap'
  ) then
    alter table public.appointments
      add constraint appointments_no_active_overlap
      exclude using gist (
        professional_id with =,
        tstzrange(start_at, end_at, '[)') with &&
      )
      where (status in ('scheduled', 'rescheduled'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.slot_holds'::regclass
       and conname = 'slot_holds_no_active_overlap'
  ) then
    alter table public.slot_holds
      add constraint slot_holds_no_active_overlap
      exclude using gist (
        professional_id with =,
        tstzrange(start_at, end_at, '[)') with &&
      )
      where (status = 'active');
  end if;
end;
$$;

create or replace function public.create_slot_hold(
  p_professional_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_phone text,
  p_session_id uuid,
  p_ttl interval default interval '5 minutes'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_end_at - p_start_at not in (interval '15 minutes', interval '30 minutes') then
    return null;
  end if;

  update public.slot_holds
     set status = 'expired'
   where professional_id = p_professional_id
     and status = 'active'
     and expires_at <= now();

  begin
    insert into public.slot_holds (professional_id, start_at, end_at, phone, session_id, expires_at)
    values (p_professional_id, p_start_at, p_end_at, p_phone, p_session_id, now() + p_ttl)
    returning id into v_id;
  exception when unique_violation or exclusion_violation then
    return null;
  end;
  return v_id;
end;
$$;

revoke all on function public.create_slot_hold(uuid, timestamptz, timestamptz, text, uuid, interval) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_slot_hold(uuid, timestamptz, timestamptz, text, uuid, interval) to service_role;
  end if;
end;
$$;
