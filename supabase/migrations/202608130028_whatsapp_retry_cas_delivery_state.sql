-- Final retry hardening for the definitive WhatsApp routing rollout. This
-- supersedes the provisional 027 RPC contracts without rewriting messages or
-- accepted patient data.

alter table public.whatsapp_access_link_deliveries
  add column if not exists status text not null default 'prepared'
    check (status in ('prepared', 'sent')),
  add column if not exists sent_at timestamptz;

update public.whatsapp_access_link_deliveries
set status = 'sent', sent_at = coalesce(sent_at, created_at)
where status <> 'sent'
  and sent_at is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.whatsapp_access_link_deliveries'::regclass
      and conname = 'whatsapp_access_link_deliveries_sent_state_check'
  ) then
    alter table public.whatsapp_access_link_deliveries
      add constraint whatsapp_access_link_deliveries_sent_state_check
      check ((status = 'sent') = (sent_at is not null));
  end if;
end;
$$;

-- Sessions accepted before provenance existed cannot be replayed safely. They
-- are expired instead of guessed, which lets a subsequent inbound request
-- begin a new, fully attributable triage.
update public.whatsapp_plan_triage_sessions
set status = 'rejected',
    insurance_plan_id = null,
    accepted_by_inbox_id = null,
    accepted_patient_updated_at = null,
    expires_at = now(),
    updated_at = now()
where status = 'accepted'
  and (accepted_by_inbox_id is null or accepted_patient_updated_at is null);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.whatsapp_plan_triage_sessions'::regclass
      and conname = 'whatsapp_plan_triage_accepted_by_inbox_fk'
  ) then
    alter table public.whatsapp_plan_triage_sessions
      add constraint whatsapp_plan_triage_accepted_by_inbox_fk
      foreign key (accepted_by_inbox_id)
      references public.whatsapp_inbox(id)
      on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.whatsapp_plan_triage_sessions'::regclass
      and conname = 'whatsapp_plan_triage_accepted_provenance_check'
  ) then
    alter table public.whatsapp_plan_triage_sessions
      add constraint whatsapp_plan_triage_accepted_provenance_check
      check (
        (status = 'accepted' and accepted_by_inbox_id is not null and accepted_patient_updated_at is not null)
        or status <> 'accepted'
      );
  end if;
end;
$$;

drop function if exists public.transition_whatsapp_plan_triage(text, text, text, uuid);

-- Replacing a prompt must compare against the one the worker actually read.
-- A null expected prompt means the caller observed no session; it therefore
-- cannot overwrite an unexpired session inserted by another worker meanwhile.
create function public.transition_whatsapp_plan_triage(
  p_phone text,
  p_action text,
  p_pending_message text,
  p_prompted_by_inbox_id uuid,
  p_expected_prompted_by_inbox_id uuid default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  triage public.whatsapp_plan_triage_sessions%rowtype;
begin
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;
  if p_action not in ('begin', 'replace', 'reject', 'expire') then
    raise exception 'INVALID_TRIAGE_TRANSITION';
  end if;
  if p_prompted_by_inbox_id is null then raise exception 'INVALID_TRIAGE_PROMPT'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_phone, 0));
  perform 1
  from public.whatsapp_inbox
  where id = p_prompted_by_inbox_id
    and phone = p_phone
  for key share;
  if not found then raise exception 'TRIAGE_PROMPT_INBOX_INVALID'; end if;

  select * into triage
  from public.whatsapp_plan_triage_sessions
  where phone = p_phone
  for update;

  if p_action in ('begin', 'replace') then
    if char_length(trim(coalesce(p_pending_message, ''))) not between 1 and 4000 then
      raise exception 'INVALID_PENDING_MESSAGE';
    end if;
    if found and triage.status = 'accepted' and triage.expires_at > now() then
      return false;
    end if;
    if p_expected_prompted_by_inbox_id is null then
      if found and triage.expires_at > now() then return false; end if;
    elsif not found
       or triage.prompted_by_inbox_id is distinct from p_expected_prompted_by_inbox_id then
      return false;
    end if;
    if found and triage.status = 'awaiting_plan'
       and triage.prompted_by_inbox_id = p_prompted_by_inbox_id
       and triage.pending_message = p_pending_message
       and triage.expires_at > now() then
      return true;
    end if;

    insert into public.whatsapp_plan_triage_sessions (
      phone, status, pending_message, prompted_by_inbox_id, insurance_plan_id,
      accepted_by_inbox_id, accepted_patient_updated_at, expires_at
    ) values (
      p_phone, 'awaiting_plan', p_pending_message, p_prompted_by_inbox_id, null,
      null, null, now() + interval '24 hours'
    )
    on conflict (phone) do update
    set status = 'awaiting_plan',
        pending_message = excluded.pending_message,
        prompted_by_inbox_id = excluded.prompted_by_inbox_id,
        insurance_plan_id = null,
        accepted_by_inbox_id = null,
        accepted_patient_updated_at = null,
        expires_at = excluded.expires_at,
        updated_at = now();
    return true;
  end if;

  if not found
     or p_expected_prompted_by_inbox_id is null
     or triage.status = 'accepted'
     or triage.prompted_by_inbox_id is distinct from p_expected_prompted_by_inbox_id
     or triage.prompted_by_inbox_id is distinct from p_prompted_by_inbox_id then
    return false;
  end if;

  update public.whatsapp_plan_triage_sessions
  set status = 'rejected',
      insurance_plan_id = null,
      accepted_by_inbox_id = null,
      accepted_patient_updated_at = null,
      expires_at = now(),
      updated_at = now()
  where phone = p_phone
    and status in ('awaiting_plan', 'rejected')
    and prompted_by_inbox_id = p_expected_prompted_by_inbox_id;
  return found;
end;
$$;

drop function if exists public.prepare_whatsapp_access_link(text, uuid, text, text);

-- One source inbox gets exactly one durable opaque token. The response carries
-- only ciphertext plus the verification fields the worker must check after
-- decryption; the raw token never enters the database.
create function public.prepare_whatsapp_access_link(
  p_phone text,
  p_source_inbox_id uuid,
  p_token_hash text,
  p_encrypted_token text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  delivery_row record;
  saved_token_id uuid;
begin
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;
  if p_source_inbox_id is null then raise exception 'INVALID_LINK_SOURCE'; end if;
  if char_length(trim(coalesce(p_token_hash, ''))) < 32 then raise exception 'INVALID_LINK_TOKEN'; end if;
  if char_length(trim(coalesce(p_encrypted_token, ''))) < 32 then raise exception 'INVALID_LINK_TOKEN'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_source_inbox_id::text, 0));
  perform 1
  from public.whatsapp_inbox
  where id = p_source_inbox_id
    and phone = p_phone
  for key share;
  if not found then raise exception 'LINK_SOURCE_INBOX_INVALID'; end if;

  select link_delivery.encrypted_token, link_delivery.phone, link_delivery.status, link_delivery.sent_at,
         token.token_hash, token.status as token_status, token.expires_at
  into delivery_row
  from public.whatsapp_access_link_deliveries link_delivery
  join public.access_tokens token on token.id = link_delivery.access_token_id
  where link_delivery.source_inbox_id = p_source_inbox_id
  for update of link_delivery, token;

  if not found then
    insert into public.access_tokens (phone, token_hash, origin, expires_at)
    values (p_phone, p_token_hash, 'whatsapp_link', now() + interval '24 hours')
    returning id into saved_token_id;
    insert into public.whatsapp_access_link_deliveries (
      source_inbox_id, phone, access_token_id, encrypted_token, status, sent_at
    ) values (
      p_source_inbox_id, p_phone, saved_token_id, p_encrypted_token, 'prepared', null
    );

    select link_delivery.encrypted_token, link_delivery.phone, link_delivery.status, link_delivery.sent_at,
           token.token_hash, token.status as token_status, token.expires_at
    into delivery_row
    from public.whatsapp_access_link_deliveries link_delivery
    join public.access_tokens token on token.id = link_delivery.access_token_id
    where link_delivery.source_inbox_id = p_source_inbox_id;
  end if;

  return jsonb_build_object(
    'encrypted_token', delivery_row.encrypted_token,
    'phone', delivery_row.phone,
    'token_hash', delivery_row.token_hash,
    'token_status', delivery_row.token_status,
    'expires_at', delivery_row.expires_at,
    'status', delivery_row.status,
    'sent_at', delivery_row.sent_at
  );
end;
$$;

create or replace function public.mark_whatsapp_access_link_delivered(
  p_phone text,
  p_source_inbox_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_phone !~ '^[0-9]{12,15}$' then raise exception 'INVALID_PHONE'; end if;
  if p_source_inbox_id is null then raise exception 'INVALID_LINK_SOURCE'; end if;
  update public.whatsapp_access_link_deliveries
  set status = 'sent', sent_at = coalesce(sent_at, now())
  where source_inbox_id = p_source_inbox_id
    and phone = p_phone
    and status = 'prepared';
  if found then return true; end if;
  return exists (
    select 1 from public.whatsapp_access_link_deliveries
    where source_inbox_id = p_source_inbox_id
      and phone = p_phone
      and status = 'sent'
      and sent_at is not null
  );
end;
$$;

create or replace function public.whatsapp_routing_schema_ready()
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if to_regclass('public.insurance_aliases_active_normalized_term_uniq') is null
     or to_regclass('public.whatsapp_access_link_deliveries') is null
     or to_regprocedure('public.transition_whatsapp_plan_triage(text,text,text,uuid,uuid)') is null
     or to_regprocedure('public.accept_whatsapp_plan_triage(text,uuid,uuid,uuid)') is null
     or to_regprocedure('public.prepare_whatsapp_access_link(text,uuid,text,text)') is null
     or to_regprocedure('public.mark_whatsapp_access_link_delivered(text,uuid)') is null
     or not exists (
       select 1 from pg_attribute
       where attrelid = 'public.insurance_aliases'::regclass
         and attname = 'normalized_alias' and not attisdropped
     )
     or not exists (
       select 1 from pg_attribute
       where attrelid = 'public.whatsapp_plan_triage_sessions'::regclass
         and attname = 'accepted_by_inbox_id' and not attisdropped
     )
     or not exists (
       select 1 from pg_attribute
       where attrelid = 'public.whatsapp_access_link_deliveries'::regclass
         and attname in ('status', 'sent_at') and not attisdropped
       group by attrelid having count(*) = 2
     )
     or not exists (
       select 1 from pg_constraint
       where conrelid = 'public.whatsapp_plan_triage_sessions'::regclass
         and conname in (
           'whatsapp_plan_triage_accepted_by_inbox_fk',
           'whatsapp_plan_triage_accepted_provenance_check'
         ) and convalidated
       group by conrelid having count(*) = 2
     )
     or exists (
       select 1 from public.whatsapp_plan_triage_sessions
       where status = 'accepted'
         and (accepted_by_inbox_id is null or accepted_patient_updated_at is null)
     )
     or not exists (
       select 1 from pg_index
       where indexrelid = 'public.insurance_aliases_active_normalized_term_uniq'::regclass
         and indisunique and indisvalid and indpred is not null
     ) then
    return false;
  end if;

  perform public.assert_active_insurance_plan_catalog();
  if exists (
    select 1 from public.insurance_aliases alias
    where alias.active
      and alias.normalized_alias <> public.normalize_public_plan_term(alias.alias)
  ) or exists (
    select alias.normalized_alias
    from public.insurance_aliases alias
    where alias.active
    group by alias.normalized_alias
    having count(*) > 1
  ) or exists (
    select 1 from public.insurance_plans plan
    where plan.active
      and not exists (
        select 1 from public.insurance_aliases alias
        where alias.insurance_plan_id = plan.id
          and alias.active
          and alias.is_canonical
          and alias.normalized_alias = public.normalize_public_plan_term(plan.name)
      )
  ) then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.transition_whatsapp_plan_triage(text, text, text, uuid, uuid) from public;
revoke all on function public.prepare_whatsapp_access_link(text, uuid, text, text) from public;
revoke all on function public.mark_whatsapp_access_link_delivered(text, uuid) from public;
revoke all on function public.whatsapp_routing_schema_ready() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.transition_whatsapp_plan_triage(text, text, text, uuid, uuid) to service_role;
    grant execute on function public.prepare_whatsapp_access_link(text, uuid, text, text) to service_role;
    grant execute on function public.mark_whatsapp_access_link_delivered(text, uuid) to service_role;
    grant execute on function public.whatsapp_routing_schema_ready() to service_role;
  end if;
end;
$$;
