-- Importa de forma controlada atendimentos criados diretamente no Google Calendar.

alter table public.appointments
  add column calendar_origin text not null default 'system',
  add column calendar_imported_at timestamptz,
  add column calendar_last_seen_at timestamptz,
  add constraint appointments_calendar_origin_check
    check (calendar_origin in ('system', 'direct')),
  add constraint appointments_direct_calendar_consistency_check
    check (
      calendar_origin = 'system'
      or (calendar_event_id is not null and calendar_imported_at is not null and calendar_last_seen_at is not null)
    );

create index appointments_direct_calendar_sync_idx
  on public.appointments (professional_id, start_at, calendar_event_id)
  where calendar_origin = 'direct' and status in ('scheduled', 'rescheduled');

-- Eventos diretos entram apenas no fluxo de confirmação; a edição no Calendar
-- não deve gerar mensagens extras de criação, remarcação ou cancelamento.
create or replace function public.enqueue_appointment_notification()
returns trigger
language plpgsql
set search_path = public
as $$
declare notification_event text;
begin
  if new.calendar_origin = 'direct' then return new; end if;

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

create function public.sync_direct_calendar_appointment(
  p_professional_id uuid,
  p_calendar_event_id text,
  p_patient_name text,
  p_phone text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_seen_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  existing_appointment public.appointments%rowtype;
  v_patient_id uuid;
  v_appointment_id uuid;
  result_status text;
  reset_confirmation boolean;
begin
  if not exists (select 1 from public.professionals where id = p_professional_id and active) then
    raise exception 'PROFESSIONAL_NOT_AVAILABLE';
  end if;
  if char_length(trim(p_calendar_event_id)) < 1 or char_length(p_calendar_event_id) > 1024 then
    raise exception 'INVALID_CALENDAR_EVENT_ID';
  end if;
  if char_length(trim(p_patient_name)) < 2 or char_length(p_patient_name) > 160 then
    raise exception 'INVALID_PATIENT_NAME';
  end if;
  if p_phone !~ '^[0-9]{12,15}$' then
    raise exception 'INVALID_PHONE';
  end if;
  if p_end_at - p_start_at not in (interval '15 minutes', interval '30 minutes') or p_start_at <= now() then
    raise exception 'INVALID_APPOINTMENT_INTERVAL';
  end if;
  if p_seen_at > now() + interval '5 minutes' then
    raise exception 'INVALID_SEEN_AT';
  end if;

  select * into existing_appointment
  from public.appointments
  where calendar_event_id = trim(p_calendar_event_id)
  for update;

  if found and existing_appointment.calendar_origin <> 'direct' then
    return jsonb_build_object('status', 'linked', 'appointment_id', existing_appointment.id);
  end if;

  begin
    insert into public.patients (name, phone)
    values (trim(p_patient_name), p_phone)
    on conflict (phone) do update
      set name = coalesce(public.patients.name, excluded.name)
    returning id into v_patient_id;

    if existing_appointment.id is null then
      insert into public.appointments (
        patient_id,
        professional_id,
        calendar_event_id,
        start_at,
        end_at,
        status,
        source,
        calendar_origin,
        calendar_imported_at,
        calendar_last_seen_at
      ) values (
        v_patient_id,
        p_professional_id,
        trim(p_calendar_event_id),
        p_start_at,
        p_end_at,
        'scheduled',
        'manual',
        'direct',
        p_seen_at,
        p_seen_at
      )
      returning id into v_appointment_id;
      result_status := 'imported';
    else
      reset_confirmation := existing_appointment.patient_id is distinct from v_patient_id
        or existing_appointment.start_at is distinct from p_start_at
        or existing_appointment.end_at is distinct from p_end_at
        or existing_appointment.status = 'cancelled';

      update public.appointments
      set patient_id = v_patient_id,
          professional_id = p_professional_id,
          start_at = p_start_at,
          end_at = p_end_at,
          status = case when reset_confirmation then 'rescheduled'::public.appointment_status else existing_appointment.status end,
          cancelled_at = null,
          calendar_last_seen_at = p_seen_at,
          attendance_confirmation_status = case when reset_confirmation then 'pending' else existing_appointment.attendance_confirmation_status end,
          attendance_confirmation_requested_at = case when reset_confirmation then null else existing_appointment.attendance_confirmation_requested_at end,
          attendance_confirmed_at = case when reset_confirmation then null else existing_appointment.attendance_confirmed_at end,
          attendance_confirmation_channel = case when reset_confirmation then null else existing_appointment.attendance_confirmation_channel end
      where id = existing_appointment.id
      returning id into v_appointment_id;
      result_status := case when reset_confirmation then 'updated' else 'unchanged' end;
    end if;
  exception when exclusion_violation or unique_violation then
    return jsonb_build_object('status', 'conflict');
  end;

  return jsonb_build_object('status', result_status, 'appointment_id', v_appointment_id);
end;
$$;

create function public.reconcile_direct_calendar_appointments(
  p_professional_id uuid,
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_seen_event_ids text[]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  reconciled_count integer;
begin
  if p_range_start >= p_range_end or p_range_end - p_range_start > interval '31 days' then
    raise exception 'INVALID_SYNC_RANGE';
  end if;

  update public.appointments
  set status = 'cancelled', cancelled_at = now()
  where professional_id = p_professional_id
    and calendar_origin = 'direct'
    and status in ('scheduled', 'rescheduled')
    and start_at >= p_range_start
    and start_at < p_range_end
    and not (calendar_event_id = any(coalesce(p_seen_event_ids, array[]::text[])));

  get diagnostics reconciled_count = row_count;
  return reconciled_count;
end;
$$;

revoke all on function public.sync_direct_calendar_appointment(uuid, text, text, text, timestamptz, timestamptz, timestamptz) from public;
revoke all on function public.reconcile_direct_calendar_appointments(uuid, timestamptz, timestamptz, text[]) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.sync_direct_calendar_appointment(uuid, text, text, text, timestamptz, timestamptz, timestamptz) to service_role;
    grant execute on function public.reconcile_direct_calendar_appointments(uuid, timestamptz, timestamptz, text[]) to service_role;
  end if;
end;
$$;
