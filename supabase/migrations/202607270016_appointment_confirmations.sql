-- Confirmação de presença pelo WhatsApp e resumo diário para a doutora.

alter table public.appointments
  add column attendance_confirmation_status text not null default 'pending',
  add column attendance_confirmation_requested_at timestamptz,
  add column attendance_confirmed_at timestamptz,
  add column attendance_confirmation_channel text,
  add constraint appointments_attendance_confirmation_status_check
    check (attendance_confirmation_status in ('pending', 'confirmed')),
  add constraint appointments_attendance_confirmation_consistency_check
    check (
      (attendance_confirmation_status = 'pending' and attendance_confirmed_at is null and attendance_confirmation_channel is null)
      or
      (attendance_confirmation_status = 'confirmed' and attendance_confirmed_at is not null and attendance_confirmation_channel = 'whatsapp')
    );

create function public.reset_appointment_attendance_confirmation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.start_at is distinct from old.start_at then
    new.attendance_confirmation_status := 'pending';
    new.attendance_confirmation_requested_at := null;
    new.attendance_confirmed_at := null;
    new.attendance_confirmation_channel := null;
  end if;
  return new;
end;
$$;

create trigger appointments_reset_attendance_confirmation
before update of start_at on public.appointments
for each row execute function public.reset_appointment_attendance_confirmation();

create function public.enqueue_appointment_confirmation_request()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  local_appointment_date date;
  confirmation_available_at timestamptz;
  schedule_version text;
begin
  if new.status not in ('scheduled', 'rescheduled') or new.start_at <= now() then
    return new;
  end if;

  local_appointment_date := (new.start_at at time zone 'America/Sao_Paulo')::date;
  if local_appointment_date <= (now() at time zone 'America/Sao_Paulo')::date then
    return new;
  end if;
  confirmation_available_at := ((local_appointment_date - 1) + time '20:00') at time zone 'America/Sao_Paulo';
  schedule_version := extract(epoch from new.start_at)::bigint::text;

  insert into public.notification_outbox (
    aggregate_type,
    aggregate_id,
    event_type,
    payload,
    available_at,
    dedupe_key
  ) values (
    'appointment',
    new.id,
    'appointment.confirmation_requested',
    jsonb_build_object('scheduled_start_at', new.start_at),
    greatest(now(), confirmation_available_at),
    'appointment.confirmation_requested:' || new.id::text || ':' || schedule_version
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

create trigger appointments_enqueue_confirmation_request
after insert or update of start_at, status on public.appointments
for each row execute function public.enqueue_appointment_confirmation_request();

insert into public.notification_outbox (
  aggregate_type,
  aggregate_id,
  event_type,
  payload,
  available_at,
  dedupe_key
)
select
  'appointment',
  appointment.id,
  'appointment.confirmation_requested',
  jsonb_build_object('scheduled_start_at', appointment.start_at),
  greatest(
    now(),
    ((((appointment.start_at at time zone 'America/Sao_Paulo')::date - 1) + time '20:00') at time zone 'America/Sao_Paulo')
  ),
  'appointment.confirmation_requested:' || appointment.id::text || ':' || extract(epoch from appointment.start_at)::bigint::text
from public.appointments appointment
where appointment.status in ('scheduled', 'rescheduled')
  and appointment.start_at > now()
  and (appointment.start_at at time zone 'America/Sao_Paulo')::date > (now() at time zone 'America/Sao_Paulo')::date
on conflict (dedupe_key) do nothing;

create function public.confirm_upcoming_appointment_by_phone(p_phone text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  candidate record;
  selected_appointment_id uuid;
  selected_start_at timestamptz;
  selected_confirmation_status text;
  candidate_count integer := 0;
begin
  if p_phone !~ '^[0-9]{12,15}$' then
    raise exception 'INVALID_PHONE';
  end if;

  for candidate in
    select appointment.id, appointment.start_at, appointment.attendance_confirmation_status
    from public.appointments appointment
    join public.patients patient on patient.id = appointment.patient_id
    where patient.phone = p_phone
      and appointment.status in ('scheduled', 'rescheduled')
      and appointment.start_at > now()
      and appointment.start_at <= now() + interval '36 hours'
    order by appointment.start_at
    for update of appointment
  loop
    candidate_count := candidate_count + 1;
    if candidate_count = 1 then
      selected_appointment_id := candidate.id;
      selected_start_at := candidate.start_at;
      selected_confirmation_status := candidate.attendance_confirmation_status;
    end if;
  end loop;

  if candidate_count = 0 then
    return jsonb_build_object('status', 'not_found');
  end if;
  if candidate_count > 1 then
    return jsonb_build_object('status', 'ambiguous');
  end if;
  if selected_confirmation_status = 'confirmed' then
    return jsonb_build_object('status', 'already_confirmed', 'appointment_id', selected_appointment_id, 'start_at', selected_start_at);
  end if;

  update public.appointments
  set attendance_confirmation_status = 'confirmed',
      attendance_confirmed_at = now(),
      attendance_confirmation_channel = 'whatsapp'
  where id = selected_appointment_id;

  return jsonb_build_object('status', 'confirmed', 'appointment_id', selected_appointment_id, 'start_at', selected_start_at);
end;
$$;

create function public.enqueue_daily_confirmation_summary(p_summary_hour integer default 8)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  local_now timestamp := now() at time zone 'America/Sao_Paulo';
  inserted_count integer;
begin
  if p_summary_hour < 0 or p_summary_hour > 23 then
    raise exception 'INVALID_SUMMARY_HOUR';
  end if;
  if local_now::time < make_time(p_summary_hour, 0, 0) then
    return 0;
  end if;

  insert into public.notification_outbox (
    aggregate_type,
    aggregate_id,
    event_type,
    payload,
    available_at,
    dedupe_key
  ) values (
    'clinic',
    '00000000-0000-0000-0000-000000000000'::uuid,
    'clinic.daily_confirmation_summary',
    jsonb_build_object('summary_date', local_now::date),
    now(),
    'clinic.daily_confirmation_summary:' || local_now::date::text
  )
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create function public.get_daily_confirmation_summary(p_summary_date date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  total_count integer;
  confirmed_count integer;
  unconfirmed_items jsonb;
begin
  select
    count(*)::integer,
    count(*) filter (where appointment.attendance_confirmation_status = 'confirmed')::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', patient.name,
          'phone', patient.phone,
          'start_at', appointment.start_at
        ) order by appointment.start_at
      ) filter (where appointment.attendance_confirmation_status <> 'confirmed'),
      '[]'::jsonb
    )
  into total_count, confirmed_count, unconfirmed_items
  from public.appointments appointment
  join public.patients patient on patient.id = appointment.patient_id
  where appointment.status in ('scheduled', 'rescheduled')
    and appointment.start_at >= (p_summary_date::timestamp at time zone 'America/Sao_Paulo')
    and appointment.start_at < ((p_summary_date + 1)::timestamp at time zone 'America/Sao_Paulo');

  return jsonb_build_object(
    'summary_date', p_summary_date,
    'total', total_count,
    'confirmed', confirmed_count,
    'unconfirmed', unconfirmed_items
  );
end;
$$;

revoke all on function public.confirm_upcoming_appointment_by_phone(text) from public;
revoke all on function public.enqueue_daily_confirmation_summary(integer) from public;
revoke all on function public.get_daily_confirmation_summary(date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.confirm_upcoming_appointment_by_phone(text) to service_role;
    grant execute on function public.enqueue_daily_confirmation_summary(integer) to service_role;
    grant execute on function public.get_daily_confirmation_summary(date) to service_role;
  end if;
end;
$$;
