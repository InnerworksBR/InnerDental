-- Reserva de slot atomica: expira holds vencidos e deixa o indice parcial decidir a corrida.
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
  update public.slot_holds
     set status = 'expired'
   where professional_id = p_professional_id
     and start_at = p_start_at
     and status = 'active'
     and expires_at <= now();

  begin
    insert into public.slot_holds (professional_id, start_at, end_at, phone, session_id, expires_at)
    values (p_professional_id, p_start_at, p_end_at, p_phone, p_session_id, now() + p_ttl)
    returning id into v_id;
  exception when unique_violation then
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
