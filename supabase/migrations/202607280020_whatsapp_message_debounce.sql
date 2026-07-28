-- Agrupa mensagens consecutivas do mesmo telefone e libera uma única resposta após 5 segundos de silêncio.

alter table public.whatsapp_inbox
  add column merged_into_id uuid references public.whatsapp_inbox(id) on delete set null;

alter table public.whatsapp_inbox
  drop constraint if exists whatsapp_inbox_processed_action_check;

alter table public.whatsapp_inbox
  add constraint whatsapp_inbox_processed_action_check
    check (processed_action in (
      'portal_link', 'structured_answer', 'llm_answer', 'fallback_answer', 'handoff', 'ignored', 'merged',
      'appointment_confirmed', 'appointment_already_confirmed', 'confirmation_not_found', 'confirmation_ambiguous',
      'plan_requested', 'plan_rejected', 'plan_rejected_caixa'
    ));

create or replace function public.ingest_whatsapp_message(p_external_id text, p_phone text, p_message_text text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  paused boolean;
  inserted_id uuid;
  buffered_ids uuid[];
  buffered_text text;
  combined_text text;
begin
  if char_length(trim(p_external_id)) < 1 or char_length(p_external_id) > 255 then raise exception 'INVALID_EXTERNAL_ID'; end if;
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;
  if char_length(p_message_text) < 1 or char_length(p_message_text) > 4000 then raise exception 'INVALID_MESSAGE'; end if;

  select exists (
    select 1 from public.whatsapp_conversation_pauses
    where phone = p_phone and paused_until > now()
  ) into paused;

  if paused then
    insert into public.whatsapp_inbox (external_id, phone, message_text, status, last_error, processed_at, processed_action)
    values (p_external_id, p_phone, p_message_text, 'processed', 'agent_paused', now(), 'ignored')
    on conflict (external_id) do nothing
    returning id into inserted_id;
    return case when inserted_id is null then 'duplicate' else 'ignored' end;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_phone, 0));

  select
    array_agg(buffered.id order by buffered.created_at),
    string_agg(buffered.message_text, E'\n' order by buffered.created_at)
  into buffered_ids, buffered_text
  from (
    select id, message_text, created_at
    from public.whatsapp_inbox
    where phone = p_phone
      and status in ('pending', 'failed')
      and dead_lettered_at is null
      and lease_token is null
    order by created_at
    for update
  ) buffered;

  combined_text := case
    when buffered_text is null then p_message_text
    else right(buffered_text || E'\n' || p_message_text, 4000)
  end;

  insert into public.whatsapp_inbox (external_id, phone, message_text, status, available_at)
  values (p_external_id, p_phone, combined_text, 'pending', now() + interval '5 seconds')
  on conflict (external_id) do nothing
  returning id into inserted_id;

  if inserted_id is null then return 'duplicate'; end if;

  if buffered_ids is not null then
    update public.whatsapp_inbox
    set status = 'processed', processed_at = now(), processed_action = 'merged',
        last_error = null, merged_into_id = inserted_id
    where id = any(buffered_ids);
  end if;

  return 'queued';
end;
$$;

revoke all on function public.ingest_whatsapp_message(text, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ingest_whatsapp_message(text, text, text) to service_role;
  end if;
end;
$$;
