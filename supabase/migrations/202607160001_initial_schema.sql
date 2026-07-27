-- Luna Agenda: schema inicial do MVP.
-- Migração aditiva para banco vazio. Aplicar somente por ferramenta de migration.

create extension if not exists pgcrypto;

create type public.appointment_status as enum (
  'scheduled',
  'rescheduled',
  'cancelled',
  'completed',
  'no_show'
);

create type public.availability_exception_type as enum (
  'available',
  'blocked',
  'holiday',
  'vacation'
);

create type public.hold_status as enum ('active', 'released', 'expired', 'consumed');
create type public.access_token_status as enum ('active', 'used', 'revoked', 'expired');
create type public.notification_status as enum ('pending', 'processing', 'sent', 'failed');

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  calendar_id text not null unique check (char_length(trim(calendar_id)) > 0),
  timezone text not null default 'America/Sao_Paulo' check (timezone = 'America/Sao_Paulo'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  name text check (name is null or char_length(trim(name)) between 1 and 160),
  phone text not null unique check (phone ~ '^[0-9]{12,15}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.insurance_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 1 and 120),
  active boolean not null default true,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.insurance_aliases (
  id uuid primary key default gen_random_uuid(),
  insurance_plan_id uuid not null references public.insurance_plans(id) on delete restrict,
  alias text not null check (char_length(trim(alias)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (insurance_plan_id, alias)
);

create table public.procedures (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 1 and 160),
  description text,
  online_booking boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.procedure_coverage (
  id uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references public.procedures(id) on delete cascade,
  insurance_plan_id uuid not null references public.insurance_plans(id) on delete cascade,
  accepted boolean not null,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (procedure_id, insurance_plan_id)
);

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_duration smallint not null default 15 check (slot_duration = 15),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time),
  unique (professional_id, weekday, start_time, end_time)
);

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  type public.availability_exception_type not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and start_time < end_time)
  )
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  professional_id uuid not null references public.professionals(id) on delete restrict,
  calendar_event_id text unique,
  insurance_plan_id uuid references public.insurance_plans(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  reason text,
  source text not null check (source in ('portal', 'whatsapp', 'manual')),
  idempotency_key uuid unique,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_at < end_at),
  check (end_at - start_at = interval '15 minutes'),
  check ((status = 'cancelled') = (cancelled_at is not null))
);

create table public.slot_holds (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  phone text not null check (phone ~ '^[0-9]{12,15}$'),
  session_id uuid not null,
  status public.hold_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (start_at < end_at),
  check (end_at - start_at = interval '15 minutes'),
  check (expires_at > created_at)
);

create unique index slot_holds_one_active_slot
  on public.slot_holds (professional_id, start_at)
  where status = 'active';

create table public.access_tokens (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^[0-9]{12,15}$'),
  token_hash text not null unique check (char_length(token_hash) >= 32),
  origin text not null check (origin in ('whatsapp_link', 'direct_otp')),
  session_id uuid,
  status public.access_token_status not null default 'active',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((status = 'used') = (used_at is not null))
);

create table public.faq_entries (
  id uuid primary key default gen_random_uuid(),
  category text not null check (char_length(trim(category)) between 1 and 80),
  question text not null check (char_length(trim(question)) between 1 and 500),
  answer text not null check (char_length(trim(answer)) between 1 and 4000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, question)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null check (char_length(trim(action)) between 1 and 120),
  entity text not null check (char_length(trim(entity)) between 1 and 120),
  entity_id uuid,
  source text not null check (char_length(trim(source)) between 1 and 80),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  aggregate_type text not null check (char_length(trim(aggregate_type)) between 1 and 80),
  aggregate_id uuid not null,
  event_type text not null check (char_length(trim(event_type)) between 1 and 120),
  payload jsonb not null default '{}'::jsonb,
  status public.notification_status not null default 'pending',
  attempts smallint not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_patient_future_idx
  on public.appointments (patient_id, start_at)
  where status in ('scheduled', 'rescheduled');
create index appointments_professional_time_idx on public.appointments (professional_id, start_at, end_at);
create index availability_rules_professional_weekday_idx on public.availability_rules (professional_id, weekday) where active;
create index availability_exceptions_professional_date_idx on public.availability_exceptions (professional_id, date);
create index access_tokens_phone_active_idx on public.access_tokens (phone, expires_at) where status = 'active';
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id, created_at desc);
create index notification_outbox_pending_idx on public.notification_outbox (available_at, created_at) where status in ('pending', 'failed');

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger professionals_set_updated_at before update on public.professionals for each row execute function public.set_updated_at();
create trigger patients_set_updated_at before update on public.patients for each row execute function public.set_updated_at();
create trigger insurance_plans_set_updated_at before update on public.insurance_plans for each row execute function public.set_updated_at();
create trigger procedures_set_updated_at before update on public.procedures for each row execute function public.set_updated_at();
create trigger procedure_coverage_set_updated_at before update on public.procedure_coverage for each row execute function public.set_updated_at();
create trigger availability_rules_set_updated_at before update on public.availability_rules for each row execute function public.set_updated_at();
create trigger availability_exceptions_set_updated_at before update on public.availability_exceptions for each row execute function public.set_updated_at();
create trigger appointments_set_updated_at before update on public.appointments for each row execute function public.set_updated_at();
create trigger faq_entries_set_updated_at before update on public.faq_entries for each row execute function public.set_updated_at();
create trigger notification_outbox_set_updated_at before update on public.notification_outbox for each row execute function public.set_updated_at();
