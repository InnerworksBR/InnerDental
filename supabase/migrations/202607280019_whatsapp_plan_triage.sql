-- Exige a validação do plano antes de qualquer outro fluxo do WhatsApp.

create table public.whatsapp_plan_triage_sessions (
  phone text primary key check (phone ~ '^[0-9]{12,15}$'),
  status text not null check (status in ('awaiting_plan', 'accepted', 'rejected')),
  pending_message text not null check (char_length(pending_message) between 1 and 4000),
  prompted_by_inbox_id uuid not null,
  insurance_plan_id uuid references public.insurance_plans(id) on delete restrict,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'accepted' and insurance_plan_id is not null)
    or (status in ('awaiting_plan', 'rejected') and insurance_plan_id is null)
  )
);

create index whatsapp_plan_triage_expiration_idx
  on public.whatsapp_plan_triage_sessions (expires_at);

create trigger whatsapp_plan_triage_sessions_set_updated_at
before update on public.whatsapp_plan_triage_sessions
for each row execute function public.set_updated_at();

alter table public.whatsapp_plan_triage_sessions enable row level security;
alter table public.whatsapp_plan_triage_sessions force row level security;

alter table public.whatsapp_inbox
  drop constraint if exists whatsapp_inbox_classified_intent_check,
  drop constraint if exists whatsapp_inbox_processed_action_check;

alter table public.whatsapp_inbox
  add constraint whatsapp_inbox_classified_intent_check
    check (classified_intent in ('schedule', 'reschedule', 'cancel', 'confirm', 'insurance', 'procedure', 'faq', 'greeting', 'human')),
  add constraint whatsapp_inbox_processed_action_check
    check (processed_action in (
      'portal_link', 'structured_answer', 'llm_answer', 'handoff', 'ignored',
      'appointment_confirmed', 'appointment_already_confirmed', 'confirmation_not_found', 'confirmation_ambiguous',
      'plan_requested', 'plan_rejected', 'plan_rejected_caixa'
    ));
