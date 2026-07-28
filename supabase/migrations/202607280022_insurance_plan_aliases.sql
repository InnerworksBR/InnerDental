-- Mantém Transmontano ativo e reconhece a grafia comum "Tramontano".

insert into public.insurance_plans (name, active, instructions)
values ('Transmontano', true, null)
on conflict (name) do update
set active = true;

insert into public.insurance_aliases (insurance_plan_id, alias, active)
select id, 'Tramontano', true
from public.insurance_plans
where name = 'Transmontano'
on conflict (insurance_plan_id, alias) do update
set active = true;

-- Permite que contatos rejeitados pela ambiguidade anterior refaçam a triagem.
update public.whatsapp_plan_triage_sessions
set expires_at = now(),
    updated_at = now()
where status = 'rejected'
  and expires_at > now();
