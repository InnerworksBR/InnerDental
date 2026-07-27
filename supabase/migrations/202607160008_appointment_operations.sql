create table public.appointment_operations (
  id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id), appointment_id uuid references public.appointments(id),
  idempotency_key uuid not null unique, operation text not null check (operation in ('create','reschedule','cancel')),
  status text not null default 'pending' check (status in ('pending','completed','reconciliation_required')), response jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger appointment_operations_updated before update on public.appointment_operations for each row execute function public.set_updated_at();
alter table public.appointment_operations enable row level security;
alter table public.appointment_operations force row level security;
