-- Auditoria mínima e outbox transacional para alterações de consultas.
-- Metadados registram nomes de campos, nunca valores potencialmente sensíveis.

create function public.audit_appointment_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  changed_fields text[];
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(key order by key), '{}')
      into changed_fields
      from jsonb_each(to_jsonb(new)) as new_value(key, value)
      join jsonb_each(to_jsonb(old)) as old_value using (key)
      where new_value.value is distinct from old_value.value
        and key not in ('updated_at');
  else
    changed_fields := '{}';
  end if;

  insert into public.audit_logs (action, entity, entity_id, source, metadata)
  values (
    lower(tg_op),
    'appointment',
    coalesce(new.id, old.id),
    coalesce(nullif(current_setting('app.source', true), ''), 'database'),
    jsonb_build_object('changed_fields', to_jsonb(changed_fields))
  );

  return coalesce(new, old);
end;
$$;

create function public.enqueue_appointment_notification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.notification_outbox (aggregate_type, aggregate_id, event_type, payload)
  values (
    'appointment',
    new.id,
    case
      when tg_op = 'INSERT' then 'appointment.created'
      when old.status is distinct from new.status and new.status = 'cancelled' then 'appointment.cancelled'
      when old.start_at is distinct from new.start_at then 'appointment.rescheduled'
      else 'appointment.updated'
    end,
    jsonb_build_object('appointment_id', new.id)
  );

  return new;
end;
$$;

create trigger appointments_audit_change
after insert or update or delete on public.appointments
for each row execute function public.audit_appointment_change();

create trigger appointments_enqueue_notification
after insert or update on public.appointments
for each row execute function public.enqueue_appointment_notification();

create function public.claim_notification_outbox(batch_size integer)
returns setof public.notification_outbox
language sql
set search_path = public
as $$
  with candidates as (
    select id
    from public.notification_outbox
    where status in ('pending', 'failed')
      and available_at <= now()
    order by available_at, created_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.notification_outbox outbox
  set status = 'processing', attempts = attempts + 1
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
$$;
