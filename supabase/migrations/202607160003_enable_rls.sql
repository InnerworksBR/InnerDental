-- O portal acessa dados exclusivamente por Route Handlers no servidor.
-- Até existir uma identidade Supabase vinculada a patients, anon e authenticated
-- não recebem policies de acesso direto: RLS nega por padrão.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'professionals',
    'patients',
    'insurance_plans',
    'insurance_aliases',
    'procedures',
    'procedure_coverage',
    'availability_rules',
    'availability_exceptions',
    'appointments',
    'slot_holds',
    'access_tokens',
    'faq_entries',
    'audit_logs',
    'notification_outbox'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;
