-- Run against a disposable PostgreSQL database after applying the local
-- migrations:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database/whatsapp-routing-definitivo.sql
--
-- Each block invokes installed functions and constraints. The enclosing
-- rollback removes all fixtures without connecting to production.

begin;

do $$
declare
  test_phone constant text := '5513990000001';
  old_external_id constant text := 'incident-018-old-failed-debounce';
  new_external_id constant text := 'incident-018-new-debounce';
  resulting_text text;
  old_status text;
begin
  insert into public.whatsapp_inbox (
    external_id, phone, message_text, status, available_at, created_at
  ) values (
    old_external_id, test_phone, 'mensagem falhada antiga', 'failed',
    clock_timestamp() - interval '11 seconds', clock_timestamp() - interval '11 seconds'
  );

  perform public.ingest_whatsapp_message(new_external_id, test_phone, 'mensagem nova');

  select message_text into resulting_text
  from public.whatsapp_inbox
  where external_id = new_external_id;

  select status into old_status
  from public.whatsapp_inbox
  where external_id = old_external_id;

  if resulting_text is distinct from 'mensagem nova' then
    raise exception 'STALE_FAILED_MESSAGE_WAS_MERGED: %', resulting_text;
  end if;
  if old_status is distinct from 'failed' then
    raise exception 'STALE_FAILED_MESSAGE_WAS_CONSUMED: %', old_status;
  end if;
end;
$$;

do $$
declare
  particular_id uuid;
  rede_unna_id uuid;
  prompt_id constant uuid := '00000000-0000-4000-8000-000000000108';
  answer_id constant uuid := '00000000-0000-4000-8000-000000000109';
begin
  select id into particular_id from public.insurance_plans where name = 'Particular' and active;
  select id into rede_unna_id from public.insurance_plans where name = 'Rede UNNA' and active;
  insert into public.whatsapp_inbox (id, external_id, phone, message_text)
  values
    (prompt_id, 'incident-018-profile-prompt', '5513990000008', 'quero marcar'),
    (answer_id, 'incident-018-profile-answer', '5513990000008', 'Particular');
  insert into public.whatsapp_plan_triage_sessions (
    phone, status, pending_message, prompted_by_inbox_id, expires_at
  ) values (
    '5513990000008', 'awaiting_plan', 'quero marcar', prompt_id, now() + interval '1 hour'
  );
  perform public.accept_whatsapp_plan_triage('5513990000008', particular_id, prompt_id, answer_id);
  update public.patients
  set insurance_plan_id = rede_unna_id
  where phone = '5513990000008';
  begin
    perform public.accept_whatsapp_plan_triage('5513990000008', particular_id, prompt_id, answer_id);
    raise exception 'UNEXPECTED_ACCEPTANCE';
  exception
    when others then
      if position('TRIAGE_PROFILE_INCOMPLETE' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

do $$
declare
  first_prompt_id constant uuid := '00000000-0000-4000-8000-000000000112';
  replacement_prompt_id constant uuid := '00000000-0000-4000-8000-000000000113';
  triage_prompt_id uuid;
  first_transition boolean;
  replacement_transition boolean;
  stale_transition boolean;
begin
  insert into public.whatsapp_inbox (id, external_id, phone, message_text)
  values
    (first_prompt_id, 'incident-018-cas-first', '5513990000019', 'quero marcar'),
    (replacement_prompt_id, 'incident-018-cas-replacement', '5513990000019', 'quero remarcar');

  select public.transition_whatsapp_plan_triage(
    '5513990000019', 'begin', 'quero marcar', first_prompt_id, null
  ) into first_transition;
  select public.transition_whatsapp_plan_triage(
    '5513990000019', 'replace', 'quero remarcar', replacement_prompt_id, first_prompt_id
  ) into replacement_transition;
  select public.transition_whatsapp_plan_triage(
    '5513990000019', 'replace', 'quero marcar', first_prompt_id, first_prompt_id
  ) into stale_transition;
  select prompted_by_inbox_id into triage_prompt_id
  from public.whatsapp_plan_triage_sessions
  where phone = '5513990000019';

  if first_transition is distinct from true
     or replacement_transition is distinct from true
     or stale_transition is distinct from false
     or triage_prompt_id is distinct from replacement_prompt_id then
    raise exception 'TRIAGE_COMPARE_AND_SET_FAILED';
  end if;
end;
$$;

do $$
declare
  rede_unna_id uuid;
  odontoprev_id uuid;
  odontopreve_id uuid;
  bradesco_id uuid;
  coverage_procedure_id uuid;
  patient_id uuid;
  professional_id uuid;
  appointment_id uuid;
  coverage_count integer;
  mapped_patient_plan uuid;
  mapped_appointment_plan uuid;
  mapped_session_plan uuid;
  session_answer_id constant uuid := '00000000-0000-4000-8000-000000000111';
begin
  select id into rede_unna_id from public.insurance_plans where name = 'Rede UNNA' and active;
  if rede_unna_id is null then raise exception 'REDE_UNNA_PLAN_NOT_READY'; end if;

  -- The test intentionally starts with compatible facts on two legacy plans
  -- and none on Rede UNNA. The installed reconciliation must retain one row,
  -- then move every FK/reference before disabling both duplicates.
  insert into public.insurance_plans (name, active) values ('Odontoprev', false)
  on conflict (name) do update set active = false
  returning id into odontoprev_id;
  insert into public.insurance_plans (name, active) values ('Odontopreve', false)
  on conflict (name) do update set active = false
  returning id into odontopreve_id;
  insert into public.insurance_plans (name, active) values ('Bradesco Dental', false)
  on conflict (name) do update set active = false
  returning id into bradesco_id;
  update public.insurance_aliases
  set active = false
  where insurance_plan_id = rede_unna_id
    and not is_canonical
    and normalized_alias in ('odontoprev', 'odontopreve', 'bradesco dental');
  update public.insurance_plans set active = true where id in (odontoprev_id, odontopreve_id, bradesco_id);

  insert into public.procedures (name, description, online_booking, active)
  values ('Incident 018 coverage consolidation', 'fixture', false, true)
  returning id into coverage_procedure_id;
  insert into public.procedure_coverage (procedure_id, insurance_plan_id, accepted, instructions)
  values
    (coverage_procedure_id, odontoprev_id, true, 'Mesmo fato'),
    (coverage_procedure_id, odontopreve_id, true, 'Mesmo fato'),
    (coverage_procedure_id, bradesco_id, true, 'Mesmo fato');

  insert into public.patients (phone, insurance_plan_id)
  values ('5513990000003', odontoprev_id)
  returning id into patient_id;
  insert into public.professionals (name, calendar_id)
  values ('Incident 018 profissional', 'incident-018-calendar')
  returning id into professional_id;
  insert into public.appointments (
    patient_id, professional_id, insurance_plan_id, start_at, end_at, source
  ) values (
    patient_id, professional_id, bradesco_id,
    now() + interval '8 days', now() + interval '8 days 15 minutes', 'manual'
  ) returning id into appointment_id;
  insert into public.whatsapp_inbox (id, external_id, phone, message_text)
  values (session_answer_id, 'incident-018-reconcile-answer', '5513990000004', 'Odontopreve');
  insert into public.whatsapp_plan_triage_sessions (
    phone, status, pending_message, prompted_by_inbox_id, insurance_plan_id,
    accepted_by_inbox_id, accepted_patient_updated_at, expires_at
  ) values (
    '5513990000004', 'accepted', 'fixture', session_answer_id, odontopreve_id,
    session_answer_id, now(), now() + interval '1 hour'
  );

  perform public.reconcile_rede_unna_legacy_catalog();

  select count(*) into coverage_count
  from public.procedure_coverage coverage
  where coverage.procedure_id = coverage_procedure_id and coverage.insurance_plan_id = rede_unna_id;
  select insurance_plan_id into mapped_patient_plan from public.patients where id = patient_id;
  select insurance_plan_id into mapped_appointment_plan from public.appointments where id = appointment_id;
  select insurance_plan_id into mapped_session_plan from public.whatsapp_plan_triage_sessions where phone = '5513990000004';

  if coverage_count <> 1
     or mapped_patient_plan is distinct from rede_unna_id
     or mapped_appointment_plan is distinct from rede_unna_id
     or mapped_session_plan is distinct from rede_unna_id
     or exists (select 1 from public.insurance_plans where id in (odontoprev_id, odontopreve_id, bradesco_id) and active) then
    raise exception 'REDE_UNNA_COMPATIBLE_RECONCILIATION_FAILED';
  end if;
end;
$$;

do $$
declare
  rede_unna_id uuid;
  previan_id uuid;
  conflict_procedure_id uuid;
  legacy_active boolean;
  legacy_coverage_count integer;
begin
  select id into rede_unna_id from public.insurance_plans where name = 'Rede UNNA' and active;
  insert into public.insurance_plans (name, active) values ('Previan', false)
  on conflict (name) do update set active = false
  returning id into previan_id;
  update public.insurance_aliases
  set active = false
  where insurance_plan_id = rede_unna_id
    and not is_canonical
    and normalized_alias = 'previan';
  update public.insurance_plans set active = true where id = previan_id;
  insert into public.procedures (name, description, online_booking, active)
  values ('Incident 018 conflicting coverage', 'fixture', false, true)
  returning id into conflict_procedure_id;
  insert into public.procedure_coverage (procedure_id, insurance_plan_id, accepted, instructions)
  values
    (conflict_procedure_id, rede_unna_id, true, 'Fato Rede UNNA'),
    (conflict_procedure_id, previan_id, false, 'Fato legado divergente');

  begin
    perform public.reconcile_rede_unna_legacy_catalog();
    raise exception 'MIGRATION_FAILED_TO_REJECT_CONFLICT';
  exception
    when others then
      if position('REDE_UNNA_COVERAGE_CONFLICT' in sqlerrm) = 0 then raise; end if;
  end;

  select active into legacy_active from public.insurance_plans where id = previan_id;
  select count(*) into legacy_coverage_count
  from public.procedure_coverage coverage
  where coverage.procedure_id = conflict_procedure_id and coverage.insurance_plan_id = previan_id;
  if not legacy_active or legacy_coverage_count <> 1 then
    raise exception 'REDE_UNNA_CONFLICT_DID_NOT_ROLL_BACK';
  end if;
end;
$$;

do $$
declare
  particular_id uuid;
  persisted_patient_plan uuid;
  persisted_session_plan uuid;
  accepted_by_inbox_id uuid;
  accepted_expiry timestamptz;
  prompt_id constant uuid := '00000000-0000-4000-8000-000000000098';
  answer_id constant uuid := '00000000-0000-4000-8000-000000000099';
begin
  select id into particular_id from public.insurance_plans where name = 'Particular' and active;
  if particular_id is null then raise exception 'PARTICULAR_PLAN_NOT_READY'; end if;

  insert into public.whatsapp_inbox (id, external_id, phone, message_text)
  values
    (prompt_id, 'incident-018-particular-prompt', '5513990000002', 'quero marcar'),
    (answer_id, 'incident-018-particular-answer', '5513990000002', 'Particular');
  insert into public.whatsapp_plan_triage_sessions (
    phone, status, pending_message, prompted_by_inbox_id, expires_at
  ) values (
    '5513990000002', 'awaiting_plan', 'quero marcar', prompt_id, now() + interval '1 hour'
  );
  perform public.accept_whatsapp_plan_triage('5513990000002', particular_id, prompt_id, answer_id);
  -- A worker retry with the exact prompt and answer inbox is idempotent.
  perform public.accept_whatsapp_plan_triage('5513990000002', particular_id, prompt_id, answer_id);

  select insurance_plan_id into persisted_patient_plan from public.patients where phone = '5513990000002';
  select triage.insurance_plan_id, triage.accepted_by_inbox_id, triage.expires_at
  into persisted_session_plan, accepted_by_inbox_id, accepted_expiry
  from public.whatsapp_plan_triage_sessions triage
  where triage.phone = '5513990000002';
  if persisted_patient_plan is distinct from particular_id
     or persisted_session_plan is distinct from particular_id
     or accepted_by_inbox_id is distinct from answer_id
     or accepted_expiry < now() + interval '23 hours' then
    raise exception 'PARTICULAR_TRIAGE_NOT_ATOMIC_OR_SERVER_EXPIRED';
  end if;
end;
$$;

do $$
declare
  particular_id uuid;
  expired_prompt_id constant uuid := '00000000-0000-4000-8000-000000000102';
  expired_answer_id constant uuid := '00000000-0000-4000-8000-000000000105';
  current_prompt_id constant uuid := '00000000-0000-4000-8000-000000000103';
  wrong_prompt_id constant uuid := '00000000-0000-4000-8000-000000000104';
  current_answer_id constant uuid := '00000000-0000-4000-8000-000000000106';
begin
  select id into particular_id from public.insurance_plans where name = 'Particular' and active;
  insert into public.whatsapp_inbox (id, external_id, phone, message_text)
  values
    (expired_prompt_id, 'incident-018-expired-prompt', '5513990000005', 'prompt expirada'),
    (expired_answer_id, 'incident-018-expired-answer', '5513990000005', 'Particular'),
    (current_prompt_id, 'incident-018-current-prompt', '5513990000006', 'prompt atual'),
    (wrong_prompt_id, 'incident-018-wrong-prompt', '5513990000006', 'outro prompt'),
    (current_answer_id, 'incident-018-current-answer', '5513990000006', 'Particular');
  insert into public.whatsapp_plan_triage_sessions (
    phone, status, pending_message, prompted_by_inbox_id, expires_at
  ) values (
    '5513990000005', 'awaiting_plan', 'prompt expirada', expired_prompt_id, now() - interval '1 second'
  );
  begin
    perform public.accept_whatsapp_plan_triage('5513990000005', particular_id, expired_prompt_id, expired_answer_id);
    raise exception 'UNEXPECTED_ACCEPTANCE';
  exception
    when others then
      if position('STALE_TRIAGE_PROMPT' in sqlerrm) = 0 then raise; end if;
  end;

  insert into public.whatsapp_plan_triage_sessions (
    phone, status, pending_message, prompted_by_inbox_id, expires_at
  ) values (
    '5513990000006', 'awaiting_plan', 'prompt atual', current_prompt_id, now() + interval '1 hour'
  );
  begin
    perform public.accept_whatsapp_plan_triage('5513990000006', particular_id, wrong_prompt_id, current_answer_id);
    raise exception 'UNEXPECTED_ACCEPTANCE';
  exception
    when others then
      if position('STALE_TRIAGE_PROMPT' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

do $$
declare
  source_id constant uuid := '00000000-0000-4000-8000-000000000107';
  first_delivery jsonb;
  second_delivery jsonb;
  sent_delivery jsonb;
  delivery_count integer;
  token_count integer;
begin
  insert into public.whatsapp_inbox (id, external_id, phone, message_text)
  values (source_id, 'incident-018-link-source', '5513990000007', 'não recebi o link');

  select public.prepare_whatsapp_access_link(
    '5513990000007', source_id, repeat('a', 64), repeat('b', 48)
  ) into first_delivery;
  select public.prepare_whatsapp_access_link(
    '5513990000007', source_id, repeat('c', 64), repeat('d', 48)
  ) into second_delivery;
  perform public.mark_whatsapp_access_link_delivered('5513990000007', source_id);
  select public.prepare_whatsapp_access_link(
    '5513990000007', source_id, repeat('e', 64), repeat('f', 48)
  ) into sent_delivery;

  select count(*) into delivery_count
  from public.whatsapp_access_link_deliveries
  where source_inbox_id = source_id;
  select count(*) into token_count
  from public.access_tokens token
  join public.whatsapp_access_link_deliveries delivery on delivery.access_token_id = token.id
  where delivery.source_inbox_id = source_id;
  if first_delivery->>'encrypted_token' is distinct from repeat('b', 48)
     or second_delivery->>'encrypted_token' is distinct from first_delivery->>'encrypted_token'
     or sent_delivery->>'encrypted_token' is distinct from first_delivery->>'encrypted_token'
     or sent_delivery->>'status' is distinct from 'sent'
     or sent_delivery->>'sent_at' is null
     or delivery_count <> 1
     or token_count <> 1 then
    raise exception 'LINK_DELIVERY_NOT_IDEMPOTENT';
  end if;
end;
$$;

do $$
declare
  fixture_plan_id uuid;
begin
  insert into public.insurance_plans (name, active)
  values ('Incident 018 unique-term fixture', true)
  returning id into fixture_plan_id;
  begin
    insert into public.insurance_aliases (insurance_plan_id, alias, active)
    values (fixture_plan_id, 'Particular', true);
    raise exception 'PUBLIC_TERM_UNIQUE_INDEX_MISSING';
  exception
    when unique_violation then null;
  end;

  begin
    perform public.save_insurance_plan_catalog(
      null, 'Incident 018 atomic administrative save', null, true, array['Particular']
    );
    raise exception 'ADMINISTRATIVE_CATALOG_TRANSACTION_NOT_ENFORCED';
  exception
    when unique_violation then null;
  end;
  if exists (
    select 1 from public.insurance_plans where name = 'Incident 018 atomic administrative save'
  ) then
    raise exception 'ADMINISTRATIVE_CATALOG_PARTIAL_WRITE';
  end if;
end;
$$;

do $$
begin
  if public.whatsapp_routing_schema_ready() is distinct from true then
    raise exception 'WHATSAPP_ROUTING_SCHEMA_NOT_READY';
  end if;
end;
$$;

rollback;
