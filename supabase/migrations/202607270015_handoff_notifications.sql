-- Enfileira de forma atômica e idempotente a notificação de atendimento humano.

create or replace function public.enqueue_human_handoff(
  p_inbox_id uuid,
  p_phone text,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  handoff_id uuid;
begin
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;
  if char_length(trim(p_reason)) < 1 or char_length(p_reason) > 120 then raise exception 'INVALID_REASON'; end if;

  insert into public.human_handoffs (inbox_id, phone, reason)
  values (p_inbox_id, p_phone, trim(p_reason))
  on conflict (inbox_id) do update set reason = excluded.reason
  returning id into handoff_id;

  insert into public.notification_outbox (aggregate_type, aggregate_id, event_type, payload, dedupe_key)
  values (
    'human_handoff',
    handoff_id,
    'human_handoff.created',
    jsonb_build_object('correlation_id', p_inbox_id),
    'human_handoff.created:' || handoff_id::text
  )
  on conflict (dedupe_key) do nothing;

  return handoff_id;
end;
$$;

revoke all on function public.enqueue_human_handoff(uuid, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.enqueue_human_handoff(uuid, text, text) to service_role;
  end if;
end;
$$;
