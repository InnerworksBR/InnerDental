-- Painel operacional interno: identidade, incidentes e bloqueios de dia inteiro.
-- Migration aditiva. Aplicar somente pela ferramenta de migrations autorizada.

create type public.internal_role as enum ('owner', 'operator');
create type public.operational_incident_status as enum ('open', 'resolved');
create type public.operational_incident_category as enum (
  'validation',
  'google_calendar',
  'supabase',
  'evolution',
  'worker',
  'unknown'
);
create type public.calendar_block_status as enum ('active', 'reconciliation_required', 'cancelled');

alter table public.audit_logs
  add column actor_id uuid references auth.users(id) on delete set null;

alter table public.whatsapp_inbox
  add column classified_intent text check (classified_intent in ('schedule', 'reschedule', 'cancel', 'question', 'unknown')),
  add column processed_action text check (processed_action in ('portal_link', 'structured_answer', 'handoff'));

create table public.internal_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.internal_role not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.operational_incidents (
  id uuid primary key default gen_random_uuid(),
  category public.operational_incident_category not null,
  status public.operational_incident_status not null default 'open',
  correlation_id text,
  appointment_id uuid references public.appointments(id) on delete set null,
  summary text not null check (char_length(trim(summary)) between 1 and 500),
  opened_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((status = 'resolved') = (resolved_at is not null)),
  check (resolved_by is null or status = 'resolved')
);

create table public.operational_incident_notes (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.operational_incidents(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete restrict,
  date date not null,
  calendar_event_id text unique,
  status public.calendar_block_status not null default 'reconciliation_required',
  created_by uuid references auth.users(id) on delete set null,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (
    (status = 'active' and calendar_event_id is not null and cancelled_at is null)
    or (status = 'reconciliation_required' and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null)
  )
);

create unique index calendar_blocks_active_professional_date_idx
  on public.calendar_blocks (professional_id, date)
  where status in ('active', 'reconciliation_required');
create index operational_incidents_opened_idx
  on public.operational_incidents (status, opened_at desc);
create index operational_incidents_correlation_idx
  on public.operational_incidents (correlation_id, opened_at desc)
  where correlation_id is not null;
create index operational_incident_notes_incident_idx
  on public.operational_incident_notes (incident_id, created_at);

create function public.audit_internal_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  changed_fields text[];
  actor uuid;
  row_data jsonb;
  entity_uuid uuid;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

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

  begin
    actor := nullif(current_setting('app.actor_id', true), '')::uuid;
  exception when invalid_text_representation then
    actor := null;
  end;

  begin
    entity_uuid := coalesce(
      nullif(row_data ->> 'id', '')::uuid,
      nullif(row_data ->> 'user_id', '')::uuid
    );
  exception when invalid_text_representation then
    entity_uuid := null;
  end;

  insert into public.audit_logs (action, entity, entity_id, source, actor_id, metadata)
  values (
    lower(tg_op),
    tg_table_name,
    entity_uuid,
    coalesce(nullif(current_setting('app.source', true), ''), 'database'),
    actor,
    jsonb_build_object('changed_fields', to_jsonb(changed_fields))
  );

  return coalesce(new, old);
end;
$$;

create trigger internal_profiles_set_updated_at
before update on public.internal_profiles
for each row execute function public.set_updated_at();

create trigger calendar_blocks_set_updated_at
before update on public.calendar_blocks
for each row execute function public.set_updated_at();

create trigger internal_profiles_audit_change
after insert or update or delete on public.internal_profiles
for each row execute function public.audit_internal_change();

create trigger operational_incidents_audit_change
after insert or update or delete on public.operational_incidents
for each row execute function public.audit_internal_change();

create trigger calendar_blocks_audit_change
after insert or update or delete on public.calendar_blocks
for each row execute function public.audit_internal_change();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'internal_profiles',
    'operational_incidents',
    'operational_incident_notes',
    'calendar_blocks'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;
