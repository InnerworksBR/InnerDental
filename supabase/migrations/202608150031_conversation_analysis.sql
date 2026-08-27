-- Conversation analysis logs: stores AI-classified outcomes for WhatsApp conversations.
-- Created for /interno painel conversation analysis feature.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'conversation_outcome') then
    create type public.conversation_outcome as enum (
      'success',
      'confused',
      'abandoned',
      'error',
      'handoff_needed',
      'spam'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'conversation_analysis_window') then
    create type public.conversation_analysis_window as enum ('24h', '7d', '30d');
  end if;
end $$;

create table if not exists public.conversation_analysis_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_key text not null,
  window public.conversation_analysis_window not null,
  outcome public.conversation_outcome not null,
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  summary text not null check (char_length(summary) between 1 and 500),
  evidence jsonb not null,
  correlation_ids text[] not null default '{}',
  model text not null,
  prompt_tokens integer not null,
  completion_tokens integer not null,
  analyzed_at timestamptz not null default now(),
  analyzed_by uuid references auth.users(id) on delete set null,
  resolved boolean not null default false,
  resolved_at timestamptz
);

create index if not exists conversation_analysis_logs_window_idx
  on public.conversation_analysis_logs (window, analyzed_at desc);

create index if not exists conversation_analysis_logs_outcome_idx
  on public.conversation_analysis_logs (window, outcome, analyzed_at desc);

create index if not exists conversation_analysis_logs_unresolved_idx
  on public.conversation_analysis_logs (resolved, outcome)
  where resolved = false;

alter table public.conversation_analysis_logs enable row level security;
alter table public.conversation_analysis_logs force row level security;
